<?php
/**
 * TURBO PISTA — global ranking API (JSON).
 *
 *   GET  scores.php                              → { ok, scores: [top 20] }
 *   POST scores.php  { action: "start" }         → { ok, token }       a race begins
 *   POST scores.php  { action: "submit", token, name, score, distance, car }
 *                                                → { ok, rank, scores }
 *
 * Basic anti-cheat: the server times each race itself (from "start" to "submit"), so the
 * distance must fit what the fastest car could drive in that time, and the points must
 * fit that distance. Each token is spent once, and one connection may send one score
 * every 30 seconds. SQL always goes through prepared statements (PDO).
 *
 * The SQLite file lives in data/ (blocked from the web and ignored by git, so a deploy
 * never uploads or overwrites it).
 */

declare(strict_types=1);

require __DIR__ . '/inc/ranking.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex');

function reply(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $error, array $extra = []): void
{
    reply($status, ['ok' => false, 'error' => $error] + $extra);
}

/** Integer field of the request body, or null when missing or not a whole number. */
function int_field(array $in, string $key): ?int
{
    $v = $in[$key] ?? null;
    if (is_int($v)) {
        return $v;
    }
    if (is_float($v) && floor($v) === $v && abs($v) < 1e12) {
        return (int) $v;
    }
    if (is_string($v) && preg_match('/^\d{1,12}$/', $v)) {
        return (int) $v;
    }

    return null;
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        reply(200, ['ok' => true, 'scores' => ranking_top()]);
    }
    if ($method !== 'POST') {
        header('Allow: GET, POST');
        fail(405, 'method');
    }

    $raw = (string) file_get_contents('php://input', false, null, 0, 4096);
    $in = json_decode($raw, true);
    if (!is_array($in)) {
        fail(400, 'bad_request');
    }
    $action = (string) ($in['action'] ?? '');

    // ---- a race starts: hand out a token ------------------------------------------
    if ($action === 'start') {
        $wait = ranking_cooldown('start', RANKING_START_GAP);
        if ($wait > 0) {
            fail(429, 'wait', ['retry' => $wait]);
        }
        ranking_query('DELETE FROM runs WHERE started < ?', [time() - RANKING_RUN_MAX_AGE]);
        $token = bin2hex(random_bytes(16));
        ranking_query('INSERT INTO runs (token, started) VALUES (?, ?)', [$token, time()]);
        reply(200, ['ok' => true, 'token' => $token]);
    }

    if ($action !== 'submit') {
        fail(400, 'bad_request');
    }

    // ---- a score arrives ------------------------------------------------------------
    $token = (string) ($in['token'] ?? '');
    $name = trim((string) ($in['name'] ?? ''));
    $score = int_field($in, 'score');
    $distance = int_field($in, 'distance');
    $car = int_field($in, 'car');

    if (!ranking_valid_name($name)) {
        fail(422, 'name');
    }
    if (ranking_offensive($name)) {
        fail(422, 'name_offensive');
    }
    if ($score === null || $distance === null || $car === null || $car < 0 || $car >= RANKING_CARS || !preg_match('/^[0-9a-f]{32}$/', $token)) {
        fail(400, 'bad_request');
    }

    $run = ranking_query('SELECT started, used FROM runs WHERE token = ?', [$token])->fetch();
    if (!$run || (int) $run['used'] === 1) {
        fail(403, 'token');
    }
    $seconds = time() - (int) $run['started'];
    if ($seconds > RANKING_RUN_MAX_AGE) {
        fail(403, 'token');
    }
    // Distance and points must be possible in the time the race really took.
    if ($seconds < RANKING_MIN_RUN || $distance > ($seconds - 2) * RANKING_MAX_MPS + 60) {
        fail(422, 'implausible');
    }
    if ($score < $distance || $score > $distance + $distance * RANKING_BONUS_PER_M + RANKING_BONUS_FLAT) {
        fail(422, 'implausible');
    }

    $wait = ranking_cooldown('submit', RANKING_COOLDOWN);
    if ($wait > 0) {
        fail(429, 'wait', ['retry' => $wait]);
    }

    // Only scores that make the top 20 are kept.
    $top = ranking_top();
    if (count($top) >= RANKING_TOP && $score <= $top[RANKING_TOP - 1]['score']) {
        ranking_query('UPDATE runs SET used = 1 WHERE token = ?', [$token]);
        fail(200, 'not_top', ['scores' => $top]);
    }

    $pdo = ranking_db();
    $pdo->beginTransaction();
    ranking_query('UPDATE runs SET used = 1 WHERE token = ?', [$token]);
    ranking_query(
        'INSERT INTO scores (name, score, distance, car, created_at) VALUES (?, ?, ?, ?, ?)',
        [$name, $score, $distance, $car, gmdate('Y-m-d H:i:s')]
    );
    $id = (int) $pdo->lastInsertId();
    // The table never grows past RANKING_KEEP rows.
    ranking_query(
        'DELETE FROM scores WHERE id NOT IN (SELECT id FROM scores ORDER BY score DESC, id ASC LIMIT ' . RANKING_KEEP . ')'
    );
    $pdo->commit();

    $rank = 1 + (int) ranking_query(
        'SELECT COUNT(*) FROM scores WHERE score > ? OR (score = ? AND id < ?)',
        [$score, $score, $id]
    )->fetchColumn();

    reply(200, ['ok' => true, 'rank' => $rank, 'scores' => ranking_top()]);
} catch (Throwable $e) {
    error_log('turbo-pista ranking: ' . $e->getMessage());
    fail(503, 'unavailable');
}
