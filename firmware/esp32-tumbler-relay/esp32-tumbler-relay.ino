/**
 * Rock tumbler relay — ESP32
 *
 * HTTP API matches Tumbler Remote app / docs/backend-api.md (tumbler routes only).
 * Point the app API base URL at http://<esp32-ip> on your LAN for direct testing,
 * or put a gateway in front for HTTPS + camera streaming.
 *
 * Wiring: VIN→VCC, GND→GND, GPIO26→IN (5V low-trigger relay module).
 * Motor hot via relay COM + NO.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>

#include "config.h"

#ifndef RELAY_PIN
#define RELAY_PIN 26
#endif

#ifndef DEVICE_ID
#define DEVICE_ID "tumbler-01"
#endif

#ifndef RELAY_ON_LEVEL
#define RELAY_ON_LEVEL HIGH
#endif

#ifndef RELAY_OFF_LEVEL
#define RELAY_OFF_LEVEL LOW
#endif

WebServer server(80);

bool motorRunning = false;

void setMotor(bool on) {
  motorRunning = on;
  digitalWrite(RELAY_PIN, on ? RELAY_ON_LEVEL : RELAY_OFF_LEVEL);
}

void addCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

bool authorizeRequest() {
#if defined(API_KEY) && (API_KEY[0] != '\0')
  if (!server.hasHeader("Authorization")) {
    return false;
  }
  String auth = server.header("Authorization");
  String expected = String("Bearer ") + API_KEY;
  return auth == expected;
#else
  (void)server;
  return true;
#endif
}

String readDeviceIdFromBody() {
  if (!server.hasArg("plain")) {
    return "";
  }
  String body = server.arg("plain");
  const String key = "\"deviceId\"";
  int idx = body.indexOf(key);
  if (idx < 0) {
    return "";
  }
  int colon = body.indexOf(':', idx);
  if (colon < 0) {
    return "";
  }
  int firstQuote = body.indexOf('"', colon + 1);
  if (firstQuote < 0) {
    return "";
  }
  int secondQuote = body.indexOf('"', firstQuote + 1);
  if (secondQuote < 0) {
    return "";
  }
  return body.substring(firstQuote + 1, secondQuote);
}

bool deviceIdMatches() {
  String requested = readDeviceIdFromBody();
  if (requested.length() == 0) {
    return true;
  }
  return requested == DEVICE_ID;
}

void sendJson(int code, const String& payload) {
  addCorsHeaders();
  server.send(code, "application/json", payload);
}

void sendUnauthorized() {
  sendJson(401, "{\"error\":\"unauthorized\"}");
}

void sendBadDevice() {
  sendJson(400, "{\"error\":\"deviceId mismatch\"}");
}

void handleOptions() {
  addCorsHeaders();
  server.send(204);
}

void handleNotFound() {
  if (server.method() == HTTP_OPTIONS) {
    handleOptions();
    return;
  }
  sendJson(404, "{\"error\":\"not found\"}");
}

void handleHealth() {
  String payload = String("{\"ok\":true,\"deviceId\":\"") + DEVICE_ID +
                   "\",\"status\":\"" + (motorRunning ? "running" : "idle") +
                   "\",\"ip\":\"" + WiFi.localIP().toString() + "\"}";
  sendJson(200, payload);
}

void handleStart() {
  if (!authorizeRequest()) {
    sendUnauthorized();
    return;
  }
  if (!deviceIdMatches()) {
    sendBadDevice();
    return;
  }
  setMotor(true);
  String payload = String("{\"status\":\"running\",\"deviceId\":\"") + DEVICE_ID + "\"}";
  sendJson(200, payload);
}

void handleStop() {
  if (!authorizeRequest()) {
    sendUnauthorized();
    return;
  }
  if (!deviceIdMatches()) {
    sendBadDevice();
    return;
  }
  setMotor(false);
  String payload = String("{\"status\":\"idle\",\"deviceId\":\"") + DEVICE_ID + "\"}";
  sendJson(200, payload);
}

void setupRoutes() {
  server.on("/health", HTTP_GET, handleHealth);
  server.on("/api/tumbler/start", HTTP_POST, handleStart);
  server.on("/api/tumbler/stop", HTTP_POST, handleStop);
  server.on("/api/tumbler/start", HTTP_OPTIONS, handleOptions);
  server.on("/api/tumbler/stop", HTTP_OPTIONS, handleOptions);
  server.onNotFound(handleNotFound);
}

void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(RELAY_PIN, OUTPUT);
  setMotor(false);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi");
  uint8_t attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 60) {
    delay(500);
    Serial.print('.');
    attempts++;
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi failed — check config.h");
    return;
  }

  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("Device ID: ");
  Serial.println(DEVICE_ID);

  setupRoutes();
  server.begin();
  Serial.println("HTTP server ready");
  Serial.println("  POST /api/tumbler/start");
  Serial.println("  POST /api/tumbler/stop");
  Serial.println("  GET  /health");
}

void loop() {
  server.handleClient();
}
