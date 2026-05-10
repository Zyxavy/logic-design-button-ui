//
//  LED UI – Arduino Receiver
//  Common-cathode RGB LED on pins 9 (R), 10 (G), 11 (B)
//  Baud: 9600
//
//  Commands received over Serial (one per line):
//    POWER:ON / POWER:OFF
//    BRIGHTNESS:0-100
//    MODE:SOLID / MODE:STROBE / MODE:FADE / MODE:RAINBOW
//    MODE:POLICE / MODE:CANDLE / MODE:SUNRISE
//

const int PIN_R = 9;
const int PIN_G = 10;
const int PIN_B = 11;

// State
bool  powerOn    = true;
int   brightness = 75;   // 0-100

// Mode IDs
enum Mode { SOLID, STROBE, FADE, RAINBOW, POLICE, CANDLE, SUNRISE };
Mode currentMode = SOLID;

// Timing
unsigned long lastTick = 0;
int  phase = 0;      // 0-255 generic counter
bool strobeState = false;

// setup
void setup() {
  pinMode(PIN_R, OUTPUT);
  pinMode(PIN_G, OUTPUT);
  pinMode(PIN_B, OUTPUT);
  Serial.begin(9600);
  setRGB(255, 176, 0);  // warm amber on boot
}

// loop
void loop() {
  handleSerial();
  if (powerOn) {
    runMode();
  } else {
    setRGB(0, 0, 0);
  }
}

// Serial Parser
void handleSerial() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();

  if (line == "POWER:ON")  { powerOn = true;  return; }
  if (line == "POWER:OFF") { powerOn = false; return; }

  if (line.startsWith("BRIGHTNESS:")) {
    brightness = constrain(line.substring(11).toInt(), 0, 100);
    return;
  }

  if (line.startsWith("MODE:")) {
    String m = line.substring(5);
    phase = 0;
    if      (m == "SOLID")   currentMode = SOLID;
    else if (m == "STROBE")  currentMode = STROBE;
    else if (m == "FADE")    currentMode = FADE;
    else if (m == "RAINBOW") currentMode = RAINBOW;
    else if (m == "POLICE")  currentMode = POLICE;
    else if (m == "CANDLE")  currentMode = CANDLE;
    else if (m == "SUNRISE") currentMode = SUNRISE;
  }
}

// Mode Runner
void runMode() {
  unsigned long now = millis();

  switch (currentMode) {

    case SOLID:
      // Warm amber scaled by brightness
      applyBrightness(255, 176, 0);
      break;

    case STROBE:
      if (now - lastTick > 80) {
        lastTick = now;
        strobeState = !strobeState;
        strobeState ? applyBrightness(255, 255, 255) : setRGB(0, 0, 0);
      }
      break;

    case FADE: {
      // Breathe: sine wave on brightness
      if (now - lastTick > 12) {
        lastTick = now;
        phase = (phase + 1) % 256;
        float s = (sin(phase * 2.0 * PI / 256.0) + 1.0) / 2.0;
        int v = round(s * 255 * brightness / 100.0);
        setRGB(v, round(v * 0.69), 0);   // amber hue
      }
      break;
    }

    case RAINBOW: {
      if (now - lastTick > 15) {
        lastTick = now;
        phase = (phase + 1) % 256;
        int r, g, b;
        hsvToRgb(phase, 255, 255 * brightness / 100, r, g, b);
        setRGB(r, g, b);
      }
      break;
    }

    case POLICE: {
      // Red–Blue alternating 200 ms each
      if (now - lastTick > 200) {
        lastTick = now;
        strobeState = !strobeState;
        if (strobeState) applyBrightness(255, 0, 0);
        else             applyBrightness(0,   0, 255);
      }
      break;
    }

    case CANDLE: {
      // Random flicker
      if (now - lastTick > 60) {
        lastTick = now;
        int flicker = random(180, 255) * brightness / 100;
        setRGB(flicker, round(flicker * 0.35), 0);
      }
      break;
    }

    case SUNRISE: {
      // Slow cycle: deep red → orange → warm white over 8 s
      if (now - lastTick > 40) {
        lastTick = now;
        phase = (phase + 1) % 200;
        float t = phase / 199.0;
        int r = 255 * brightness / 100;
        int g = round(t * 140 * brightness / 100);
        int b = round(t * t * 80 * brightness / 100);
        setRGB(r, g, b);
      }
      break;
    }
  }
}

// Helpers
void applyBrightness(int r, int g, int b) {
  setRGB(r * brightness / 100, g * brightness / 100, b * brightness / 100);
}

void setRGB(int r, int g, int b) {
  analogWrite(PIN_R, constrain(r, 0, 255));
  analogWrite(PIN_G, constrain(g, 0, 255));
  analogWrite(PIN_B, constrain(b, 0, 255));
}

// Hue 0-255, sat 0-255, val 0-255
void hsvToRgb(int h, int s, int v, int &r, int &g, int &b) {
  if (s == 0) { r = g = b = v; return; }
  int region = h / 43;
  int remainder = (h - region * 43) * 6;
  int p = (v * (255 - s)) >> 8;
  int q = (v * (255 - ((s * remainder) >> 8))) >> 8;
  int t = (v * (255 - ((s * (255 - remainder)) >> 8))) >> 8;
  switch (region) {
    case 0: r=v; g=t; b=p; break;
    case 1: r=q; g=v; b=p; break;
    case 2: r=p; g=v; b=t; break;
    case 3: r=p; g=q; b=v; break;
    case 4: r=t; g=p; b=v; break;
    default:r=v; g=p; b=q; break;
  }
}
