<?php
/**
 * TURBO PISTA — global ranking helpers (database, client key, nickname rules).
 *
 * Privacy: a score row stores only the nickname, points, distance, car number and the
 * date. The 30-second cooldown needs to recognize a connection for a moment, so it keeps
 * a salted hash of the IP (never the IP itself) and deletes it a minute later.
 *
 * This folder is not reachable from the web (see .htaccess); only ../scores.php is.
 */

declare(strict_types=1);

const RANKING_TOP = 20;            // shown and accepted positions
const RANKING_KEEP = 100;          // rows kept in the table (the rest are deleted)
const RANKING_CARS = 8;            // car numbers 0…7 (07, 21, 33, 88, 12, 45, 64, 99)
const RANKING_COOLDOWN = 30;       // seconds between two submissions from one connection
const RANKING_START_GAP = 2;       // seconds between two race starts from one connection
const RANKING_RUN_MAX_AGE = 21600; // a race token expires after 6 hours
const RANKING_MIN_RUN = 4;         // the countdown alone takes 2.4 s
const RANKING_MAX_MPS = 140;       // fastest possible: 99 with nitro ≈ 130 m/s
const RANKING_BONUS_PER_M = 5;     // coins, jumps, rings, loops… never more than this per meter
const RANKING_BONUS_FLAT = 2000;

function ranking_data_dir(): string
{
    return __DIR__ . '/../data';
}

function ranking_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    if (!extension_loaded('pdo_sqlite')) {
        throw new RuntimeException('pdo_sqlite is not enabled');
    }
    $pdo = new PDO('sqlite:' . ranking_data_dir() . '/scores.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 5,
    ]);
    $pdo->exec('PRAGMA busy_timeout = 5000');
    $pdo->exec('CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        score INTEGER NOT NULL,
        distance INTEGER NOT NULL,
        car INTEGER NOT NULL,
        created_at TEXT NOT NULL
    )');
    $pdo->exec('CREATE INDEX IF NOT EXISTS scores_rank ON scores (score DESC, id ASC)');
    // A race token: issued when a race starts, spent when its score is sent.
    $pdo->exec('CREATE TABLE IF NOT EXISTS runs (
        token TEXT PRIMARY KEY,
        started INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
    )');
    // Cooldowns: salted hash of the connection → last action time (kept one minute).
    $pdo->exec('CREATE TABLE IF NOT EXISTS throttle (
        client TEXT PRIMARY KEY,
        at INTEGER NOT NULL
    )');

    return $pdo;
}

/** Run a prepared statement (never concatenate SQL). */
function ranking_query(string $sql, array $params = []): PDOStatement
{
    $stmt = ranking_db()->prepare($sql);
    $stmt->execute($params);

    return $stmt;
}

/** Top scores, best first (ties: the oldest first). */
function ranking_top(int $limit = RANKING_TOP): array
{
    $rows = ranking_query(
        'SELECT name, score, distance, car, created_at FROM scores ORDER BY score DESC, id ASC LIMIT ' . (int) $limit
    )->fetchAll();

    return array_map(static function (array $r): array {
        return [
            'name' => $r['name'],
            'score' => (int) $r['score'],
            'distance' => (int) $r['distance'],
            'car' => (int) $r['car'],
            'date' => gmdate('Y-m-d\TH:i:s\Z', (int) strtotime($r['created_at'] . ' UTC')),
        ];
    }, $rows);
}

// ---------------------------------------------------------------------------
// The connection, for the cooldowns only
// ---------------------------------------------------------------------------

/** https://www.cloudflare.com/ips-v4 and /ips-v6 (same list as /garage, 2026-09-26). */
const RANKING_CLOUDFLARE = [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
    '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
    '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
    '2a06:98c0::/29', '2c0f:f248::/32',
];

function ranking_in_cidr(string $ip, string $cidr): bool
{
    [$subnet, $bits] = explode('/', $cidr);
    $ipBin = @inet_pton($ip);
    $subnetBin = @inet_pton($subnet);
    if ($ipBin === false || $subnetBin === false || strlen($ipBin) !== strlen($subnetBin)) {
        return false;
    }
    $bits = (int) $bits;
    $full = intdiv($bits, 8);
    if (substr($ipBin, 0, $full) !== substr($subnetBin, 0, $full)) {
        return false;
    }
    $rem = $bits % 8;
    if ($rem === 0) {
        return true;
    }
    $mask = (0xFF << (8 - $rem)) & 0xFF;

    return (ord($ipBin[$full]) & $mask) === (ord($subnetBin[$full]) & $mask);
}

/**
 * The visitor's IP. Behind Cloudflare REMOTE_ADDR is the edge (shared by many people),
 * so CF-Connecting-IP is used, but only when the request really comes from Cloudflare.
 */
function ranking_client_ip(): string
{
    $remote = (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    $cf = (string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? '');
    if ($cf !== '' && filter_var($cf, FILTER_VALIDATE_IP)) {
        foreach (RANKING_CLOUDFLARE as $range) {
            if (ranking_in_cidr($remote, $range)) {
                return $cf;
            }
        }
    }

    return $remote;
}

/** Salted hash of the IP: the salt is random, made once, and lives in data/ (not in git). */
function ranking_client_key(string $purpose): string
{
    $file = ranking_data_dir() . '/salt.key';
    $salt = is_file($file) ? (string) file_get_contents($file) : '';
    if (strlen($salt) < 32) {
        $salt = bin2hex(random_bytes(32));
        @file_put_contents($file, $salt, LOCK_EX);
        @chmod($file, 0600);
    }

    return hash_hmac('sha256', $purpose . '|' . ranking_client_ip(), $salt);
}

/**
 * Cooldown per connection. Returns 0 when the action may go ahead (and starts the
 * cooldown), or the seconds left to wait.
 */
function ranking_cooldown(string $purpose, int $seconds): int
{
    $now = time();
    ranking_query('DELETE FROM throttle WHERE at < ?', [$now - 60]);
    $key = ranking_client_key($purpose);
    $last = ranking_query('SELECT at FROM throttle WHERE client = ?', [$key])->fetchColumn();
    if ($last !== false && $now - (int) $last < $seconds) {
        return $seconds - ($now - (int) $last);
    }
    ranking_query('INSERT OR REPLACE INTO throttle (client, at) VALUES (?, ?)', [$key, $now]);

    return 0;
}

// ---------------------------------------------------------------------------
// Nicknames
// ---------------------------------------------------------------------------

/** 3 to 12 letters, numbers or underscores. */
function ranking_valid_name(string $name): bool
{
    return (bool) preg_match('/^[A-Za-z0-9_]{3,12}$/', $name);
}

/**
 * Basic filter for offensive words in Spanish and English. The nickname is lowercased,
 * look-alike digits become letters (p3nd3j0 → pendejo) and underscores go away; it is
 * checked as is and with repeated letters squeezed (puuuto → puto).
 */
function ranking_offensive(string $name): bool
{
    $plain = strtr(strtolower($name), ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '8' => 'b', '_' => '']);
    $forms = array_unique([$plain, (string) preg_replace('/(.)\1+/', '$1', $plain)]);

    // Found anywhere in the nickname.
    $stems = [
        // Español
        'puta', 'puto', 'pendej', 'verga', 'chinga', 'cabron', 'mamon', 'mamada', 'mierda', 'joto', 'maric',
        'pinche', 'zorra', 'perra', 'estupid', 'idiota', 'imbecil', 'malparid', 'gonorrea', 'polla', 'follar',
        'panocha', 'ojete', 'culer', 'culia', 'choto', 'nalgas', 'tetas', 'sexo', 'violad', 'gilipolla',
        'subnormal', 'retrasad', 'negrat', 'mecos', 'chingad',
        // English
        'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'nigga', 'nigger', 'faggot', 'slut',
        'whore', 'rape', 'retard', 'porn', 'sex', 'penis', 'vagina', 'asshole', 'bastard', 'twat', 'wank',
        'jerkoff', 'boob', 'dildo', 'horny',
        // Hate
        'nazi', 'hitler', 'kkk',
    ];
    // Short words that are only a problem on their own (they hide inside normal words).
    $exact = ['culo', 'ano', 'ass', 'cum', 'tit', 'tits', 'anal', 'cono', 'wtf', 'stfu', 'kys', 'fag', 'pito', 'teta'];

    foreach ($forms as $s) {
        if (in_array($s, $exact, true)) {
            return true;
        }
        foreach ($stems as $stem) {
            if (strpos($s, $stem) !== false) {
                return true;
            }
        }
    }

    return false;
}
