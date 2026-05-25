//
//  LED UI – Arduino Receiver
//  Commands received over Serial (one per line):
//    POWER:ON / POWER:OFF
//    BRIGHTNESS:0-100
//    SPEED:1-10
//    COLOR:R,G,B
//    MODE:SOLID / MODE:STROBE / MODE:FADE / MODE:RAINBOW
//    MODE:POLICE / MODE:CANDLE / MODE:SUNRISE
//    MODE:DISCO / MODE:HEARTBEAT / MODE:THUNDER / MODE:SOS / MODE:BREATHE / MODE:PARTY
//
//  CHANGES vs previous version:
//    1. Non-blocking serial parser (char-by-char buffer): fixes beat sync stutter
//    2. All modes now use solidR/G/B so they follow the color picker
//    3. BRIGHTNESS command during beat sync applies instantly without mode interruption
//    4. Serial input buffer cleared on connect to avoid stale commands
//

const int PIN_R = 9;
const int PIN_G = 11;
const int PIN_B = 10;

// State 
bool  powerOn    = true;
int   brightness = 75;   // 0-100
int   speed      = 5;    // 1-10

// Custom solid color (set by COLOR: command or color picker)
int   solidR = 255, solidG = 176, solidB = 0;

// Mode IDs
enum Mode {
  SOLID, STROBE, FADE, RAINBOW, POLICE, CANDLE, SUNRISE,
  DISCO, HEARTBEAT, THUNDER, SOS, BREATHE, PARTY
};
Mode currentMode = SOLID;

// Timing
unsigned long lastTick = 0;
int  phase = 0;
bool strobeState = false;

// Thunder state
int  thunderState   = 0;
int  thunderFlashes = 0;
unsigned long thunderWait = 0;

// Heartbeat state
int hbPhase = 0;

// SOS state
const int SOS_LEN = 17;
const int SOS_TYPE[SOS_LEN] = {1,0,1,0,1, 0, 2,0,2,0,2, 0, 1,0,1,0,1};
const int SOS_DUR [SOS_LEN] = {200,200,200,200,200, 600, 600,200,600,200,600, 600, 200,200,200,200,200};
int  sosIdx  = 0;
unsigned long sosNext = 0;
bool sosOn = false;

// Party state
int partyColor = 0;

#define SERIAL_BUF_SIZE 64
char   serialBuf[SERIAL_BUF_SIZE];
uint8_t serialBufLen = 0;

// Setup 
void setup() {
  pinMode(PIN_R, OUTPUT);
  pinMode(PIN_G, OUTPUT);
  pinMode(PIN_B, OUTPUT);
  Serial.begin(9600);
  // Flush any garbage in the buffer on startup
  while (Serial.available()) Serial.read();
  setRGB(solidR, solidG, solidB);
}

// Loop
void loop() {
  handleSerial();
  if (powerOn) runMode();
  else         setRGB(0, 0, 0);
}


void handleSerial() {
  while (Serial.available()) {
    char c = (char)Serial.read();

    // End of line: dispatch whatever we have
    if (c == '\n' || c == '\r') {
      if (serialBufLen > 0) {
        serialBuf[serialBufLen] = '\0';
        dispatchCommand(serialBuf);
        serialBufLen = 0;
      }
      continue;
    }

    // Overflow guard: discard oversized garbage
    if (serialBufLen >= SERIAL_BUF_SIZE - 1) {
      serialBufLen = 0;
      continue;
    }

    serialBuf[serialBufLen++] = c;
  }
}

// Command Dispatcher
void dispatchCommand(const char* line) {

  // POWER
  if (strcmp(line, "POWER:ON")  == 0) { powerOn = true;  return; }
  if (strcmp(line, "POWER:OFF") == 0) { powerOn = false; return; }

  // BRIGHTNESS : hot path during beat sync, handled first
  if (strncmp(line, "BRIGHTNESS:", 11) == 0) {
    brightness = constrain(atoi(line + 11), 0, 100);
    // Apply immediately if in SOLID mode (beat sync drives SOLID + BRIGHTNESS)
    if (currentMode == SOLID && powerOn) {
      applyBrightness(solidR, solidG, solidB);
    }
    return;
  }

  // SPEED
  if (strncmp(line, "SPEED:", 6) == 0) {
    speed = constrain(atoi(line + 6), 1, 10);
    return;
  }

  // COLOR:R,G,B
  if (strncmp(line, "COLOR:", 6) == 0) {
    const char* p = line + 6;
    char* end1; char* end2;
    long r = strtol(p,    &end1, 10);
    long g = strtol(end1 + 1, &end2, 10);
    long b = strtol(end2 + 1, nullptr, 10);
    solidR = constrain((int)r, 0, 255);
    solidG = constrain((int)g, 0, 255);
    solidB = constrain((int)b, 0, 255);
    currentMode = SOLID;
    return;
  }

  // MODE
  if (strncmp(line, "MODE:", 5) == 0) {
    const char* m = line + 5;
    phase = 0; sosIdx = 0; sosOn = false; sosNext = 0;
    thunderState = 0; thunderWait = millis() + random(2000, 5000);
    hbPhase = 0; partyColor = 0;
    if      (strcmp(m, "SOLID")     == 0) currentMode = SOLID;
    else if (strcmp(m, "STROBE")    == 0) currentMode = STROBE;
    else if (strcmp(m, "FADE")      == 0) currentMode = FADE;
    else if (strcmp(m, "RAINBOW")   == 0) currentMode = RAINBOW;
    else if (strcmp(m, "POLICE")    == 0) currentMode = POLICE;
    else if (strcmp(m, "CANDLE")    == 0) currentMode = CANDLE;
    else if (strcmp(m, "SUNRISE")   == 0) currentMode = SUNRISE;
    else if (strcmp(m, "DISCO")     == 0) currentMode = DISCO;
    else if (strcmp(m, "HEARTBEAT") == 0) currentMode = HEARTBEAT;
    else if (strcmp(m, "THUNDER")   == 0) currentMode = THUNDER;
    else if (strcmp(m, "SOS")       == 0) currentMode = SOS;
    else if (strcmp(m, "BREATHE")   == 0) currentMode = BREATHE;
    else if (strcmp(m, "PARTY")     == 0) currentMode = PARTY;
  }
}

// Speed helper
float speedFactor() {
  return 2.0 - (speed - 1) * (1.8 / 9.0);
}

// Mode Runner
void runMode() {
  unsigned long now = millis();

  switch (currentMode) {

    case SOLID:
      // Beat sync drives brightness via BRIGHTNESS: commands;
      // applyBrightness is called in dispatchCommand for instant response.
      // Fallback call here keeps things correct when not in beat sync.
      applyBrightness(solidR, solidG, solidB);
      break;

    case STROBE: {
      int interval = (int)(80 * speedFactor());
      if (now - lastTick > (unsigned)interval) {
        lastTick = now;
        strobeState = !strobeState;
        if (strobeState) applyBrightness(solidR, solidG, solidB);
        else             setRGB(0, 0, 0);
      }
      break;
    }

    // FADE: breathes the current color
    case FADE: {
      int interval = (int)(12 * speedFactor());
      if (now - lastTick > (unsigned)interval) {
        lastTick = now;
        phase = (phase + 1) % 256;
        float s = (sin(phase * 2.0 * PI / 256.0) + 1.0) / 2.0;
        int r = round(s * solidR * brightness / 100.0);
        int g = round(s * solidG * brightness / 100.0);
        int b = round(s * solidB * brightness / 100.0);
        setRGB(r, g, b);
      }
      break;
    }

    case RAINBOW: {
      int interval = (int)(15 * speedFactor());
      if (now - lastTick > (unsigned)interval) {
        lastTick = now;
        phase = (phase + 1) % 256;
        int r, g, b;
        hsvToRgb(phase, 255, 255 * brightness / 100, r, g, b);
        setRGB(r, g, b);
      }
      break;
    }

    // POLICE: uses current color for first flash, blue for second
    case POLICE:
      if (now - lastTick > 200) {
        lastTick = now;
        strobeState = !strobeState;
        if (strobeState) applyBrightness(solidR, solidG, solidB);
        else             applyBrightness(0, 0, 255);
      }
      break;

    // CANDLE: flickers at current color
    case CANDLE: {
      int interval = (int)(60 * speedFactor());
      if (now - lastTick > (unsigned)interval) {
        lastTick = now;
        float flicker = random(180, 255) / 255.0 * brightness / 100.0;
        setRGB(
          round(solidR * flicker),
          round(solidG * flicker),
          round(solidB * flicker)
        );
      }
      break;
    }

    // SUNRISE: ramps from dark current color to full
    case SUNRISE: {
      if (now - lastTick > 40) {
        lastTick = now;
        phase = (phase + 1) % 200;
        float t = phase / 199.0;
        // t=0: deep red tint of current color; t=1: full current color
        int r = round(solidR * (0.3 + 0.7 * t) * brightness / 100.0);
        int g = round(solidG * t               * brightness / 100.0);
        int b = round(solidB * t * t           * brightness / 100.0);
        setRGB(r, g, b);
      }
      break;
    }

    // DISCO: random hue bursts
    case DISCO: {
      int interval = (int)(120 * speedFactor());
      if (now - lastTick > (unsigned)interval) {
        lastTick = now;
        int r, g, b;
        hsvToRgb(random(0, 256), 255, 255 * brightness / 100, r, g, b);
        setRGB(r, g, b);
      }
      break;
    }

    // HEARTBEAT: lub-dub, uses current color
    case HEARTBEAT: {
      int interval = (int)(8 * speedFactor());
      if (now - lastTick > (unsigned)interval) {
        lastTick = now;
        hbPhase = (hbPhase + 1) % 255;
        int v = 0;
        if      (hbPhase < 15) v = map(hbPhase,  0, 14, 0, 255);
        else if (hbPhase < 30) v = map(hbPhase, 15, 29, 255, 0);
        else if (hbPhase < 45) v = map(hbPhase, 30, 44, 0, 200);
        else if (hbPhase < 60) v = map(hbPhase, 45, 59, 200, 0);
        v = v * brightness / 100;
        setRGB(
          round(v * solidR / 255.0),
          round(v * solidG / 255.0),
          round(v * solidB / 255.0)
        );
      }
      break;
    }

    case THUNDER: {
      if (thunderState == 0) {
        setRGB(0, 0, 0);
        if (now >= thunderWait) {
          thunderState   = 1;
          thunderFlashes = random(2, 6);
          lastTick       = now;
          strobeState    = false;
        }
      } else {
        int interval = (int)(50 * speedFactor());
        if (now - lastTick > (unsigned)interval) {
          lastTick    = now;
          strobeState = !strobeState;
          if (strobeState) applyBrightness(solidR, solidG, solidB);
          else {
            setRGB(0, 0, 0);
            thunderFlashes--;
            if (thunderFlashes <= 0) {
              thunderState = 0;
              thunderWait  = now + random(2000, 6000);
            }
          }
        }
      }
      break;
    }

    case SOS: {
      if (now >= sosNext) {
        sosOn = (SOS_TYPE[sosIdx] > 0);
        if (sosOn) applyBrightness(solidR, solidG, solidB);
        else       setRGB(0, 0, 0);
        sosNext = now + SOS_DUR[sosIdx];
        sosIdx++;
        if (sosIdx >= SOS_LEN) {
          sosIdx  = 0;
          sosNext = now + SOS_DUR[SOS_LEN-1] + 2000;
        }
      }
      break;
    }

    // BREATHE: slow sine, uses current color
    case BREATHE: {
      int interval = (int)(20 * speedFactor());
      if (now - lastTick > (unsigned)interval) {
        lastTick = now;
        phase = (phase + 1) % 256;
        float s = (sin(phase * 2.0 * PI / 256.0) + 1.0) / 2.0;
        int v = round(s * brightness / 100.0 * 255);
        setRGB(
          round(v * solidR / 255.0),
          round(v * solidG / 255.0),
          round(v * solidB / 255.0)
        );
      }
      break;
    }

    // PARTY: R→G→B snap, uses current color tints
    case PARTY: {
      int interval = (int)(150 * speedFactor());
      if (now - lastTick > (unsigned)interval) {
        lastTick = now;
        partyColor = (partyColor + 1) % 3;
        int brt = 255 * brightness / 100;
        // Tint party colors toward the picked color
        if      (partyColor == 0) setRGB(brt,                  round(brt*solidG/255.0/2), round(brt*solidB/255.0/2));
        else if (partyColor == 1) setRGB(round(brt*solidR/255.0/2), brt,                  round(brt*solidB/255.0/2));
        else                      setRGB(round(brt*solidR/255.0/2), round(brt*solidG/255.0/2), brt);
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

void hsvToRgb(int h, int s, int v, int &r, int &g, int &b) {
  if (s == 0) { r = g = b = v; return; }
  int region    = h / 43;
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
