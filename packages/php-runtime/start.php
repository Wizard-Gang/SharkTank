<?php

declare(strict_types=1);

/**
 * Boot both workers in one process group:
 *   • HTTP  on :8080  — client + API + /docs /status /audit (HttpServer)
 *   • WS    on :8081  — realtime game, 30Hz authoritative tick (GameServer)
 *
 * Run:  php start.php start      (add `-d` to daemonize)
 * Then open http://localhost:8080
 */

require __DIR__ . '/vendor/autoload.php';

use ModulePHP\Server\GameServer;
use ModulePHP\Server\HttpServer;
use ModulePHP\Store\FileBlobStore;
use Workerman\Worker;

$store = new FileBlobStore(__DIR__ . '/data');

// Realtime game (the "Room Durable Object")
$ws = new Worker('websocket://0.0.0.0:8081');
(new GameServer($store, 'room-1', 'Meadow', 23))->bind($ws);

// HTTP (client + API + ops pages)
$http = new Worker('http://0.0.0.0:8080');
(new HttpServer($store, __DIR__ . '/public'))->bind($http);

Worker::runAll();
