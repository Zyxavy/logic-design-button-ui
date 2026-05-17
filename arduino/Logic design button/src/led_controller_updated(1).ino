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

const int PIN_R = 9;
const int PIN_G = 11;
const int PIN_B = 10;

// State
bool  powerOn    = true;
int   brightness = 75;   // 0-100
int   speed      = 5;    // 1-10 (10 = fastest)

// Custom solid color
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
int  thunderState   = 0;   // 0=waiting, 1=flash
int  thunderFlashes = 0;
unsigned long thunderWait = 0;

// Heartbeat state
int  hbPhase = 0;

// SOS state
const int SOS_LEN = 17;
// 1=dot on,2=dash on,0=off; durations in ms
const int SOS_TYPE[SOS_LEN] = {1,0,1,0,1, 0, 2,0,2,0,2, 0, 1,0,1,0,1};
const int SOS_DUR [SOS_LEN] = {200,200,200,200,200, 600, 600,200,600,200,600, 600, 200,200,200,200,200};
int  sosIdx = 0;
unsigned long sosNext = 0;
bool sosOn = false;

// Party state
int partyColor = 0;   // 0=R,1=G,2=B

// setup
void setup() {
  pinMode(PIN_R, OUTPUT);
  pinMode(PIN_G, OUTPUT);
  pinMode(PIN_B, OUTPUT);
  Serial.begin(9600);
  setRGB(255, 176, 0);
}

// loop
void loop() {
  handleSerial();
  if (powerOn) runMode();
  else         setRGB(0, 0, 0);
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

  if (line.startsWith("SPEED:")) {
    speed = constrain(line.substring(6).toInt(), 1, 10);
    return;
  }

  if (line.startsWith("COLOR:")) {
    String payload = line.substring(6);
    int c1 = payload.indexOf(',');
    int c2 = payload.indexOf(',', c1 + 1);
    if (c1 > 0 && c2 > 0) {
      solidR = constrain(payload.substring(0,  c1).toInt(), 0, 255);
      solidG = constrain(payload.substring(c1+1, c2).toInt(), 0, 255);
      solidB = constrain(payload.substring(c2+1).toInt(), 0, 255);
      currentMode = SOLID;
    }
    return;
  }

  if (line.startsWith("MODE:")) {
    String m = line.substring(5);
    phase = 0; sosIdx = 0; sosOn = false; sosNext = 0;
    thunderState = 0; thunderWait = millis() + random(2000, 5000);
    hbPhase = 0; partyColor = 0;
    if      (m == "SOLID")     currentMode = SOLID;
    else if (m == "STROBE")    currentMode = STROBE;
    else if (m == "FADE")      currentMode = FADE;
    else if (m == "RAINBOW")   currentMode = RAINBOW;
    else if (m == "POLICE")    currentMode = POLICE;
    else if (m == "CANDLE")    currentMode = CANDLE;
    else if (m == "SUNRISE")   currentMode = SUNRISE;
    else if (m == "DISCO")     currentMode = DISCO;
    else if (m == "HEARTBEAT") currentMode = HEARTBEAT;
    else if (m == "THUNDER")   currentMode = THUNDER;
    else if (m == "SOS")       currentMode = SOS;
    else if (m == "BREATHE")   currentMode = BREATHE;
    else if (m == "PARTY")     currentMode = PARTY;
  }
}

// Speed helper (maps 1-10 to interval multiplier)
// speedFactor: higher speed = smaller interval
float speedFactor() {
  // speed 1 → 2.0x slow, speed 10 → 0.2x fast
  return 2.0 - (speed - 1) * (1.8 / 9.0);
}

// Mode Runner
void runMode() {
  unsigned long now = millis();

  switch (currentMode) {

    case SOLID:
      setRGB(solidR, solidG, solidB);
      break;

    case STROBE: {
      int interval = (int)(80 * speedFactor());
      if (now - lastTick > (unsigned)interval) {
        lastTick = now;
        strobeState = !strobeState;
        strobeState ? applyBrightness(255, 255, 255) : setRGB(0, 0, 0);
      }
      break;
    }

    case FADE: {
      int interval = (int)(12 * speedFactor());
      if (now - lastTick > (unsigned)interval) {
        lastTick = now;
        phase = (phase + 1) % 256;
        float s = (sin(phase * 2.0 * PI / 256.0) + 1.0) / 2.0;
        int v = round(s * 255 * brightness / 100.0);
        setRGB(v, round(v * 0.69), 0);
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

    case POLICE:
      if (now - lastTick > 200) {
        lastTick = now;
        strobeState = !strobeState;
        if (strobeState) applyBrightness(255, 0, 0);
        else             applyBrightness(0,   0, 255);
      }
      break;

    case CANDLE: {
      int interval = (int)(60 * speedFactor());
      if (now - lastTick > (unsigned)interval) {
        lastTick = now;
        int flicker = random(180, 255) * brightness / 100;
        setRGB(flicker, round(flicker * 0.35), 0);
      }
      break;
    }

    case SUNRISE: {
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

    //  NEW MODES

    case DISCO: {
      // Random vivid color every interval
      int interval = (int)(120 * speedFactor());
      if (now - lastTick > (unsigned)interval) {
        lastTick = now;
        int r, g, b;
        hsvToRgb(random(0, 256), 255, 255 * brightness / 100, r, g, b);
        setRGB(r, g, b);
      }
      break;
    }

    case HEARTBEAT: {
      // lub-dub pattern: two quick pulses then long rest
      // Phase 0-255: 0-30 = first pulse up, 30-60 = down, 70-100 = second pulse up, 100-130 = down, 130-255 = rest
      int interval = (int)(8 * speedFactor());
      if (now - lastTick > (unsigned)interval) {
        lastTick = now;
        hbPhase = (hbPhase + 1) % 255;
        int v = 0;
        if      (hbPhase < 15)  v = map(hbPhase,  0,  14, 0, 255);   // lub up
        else if (hbPhase < 30)  v = map(hbPhase, 15,  29, 255, 0);   // lub down
        else if (hbPhase < 45)  v = map(hbPhase, 30,  44, 0, 200);   // dub up (softer)
        else if (hbPhase < 60)  v = map(hbPhase, 45,  59, 200, 0);   // dub down
        else                    v = 0;                                  // rest

        v = v * brightness / 100;
        setRGB(v, 0, (int)(v * 0.05));   // deep red
      }
      break;
    }

    case THUNDER: {
      // Long dark wait → burst of white flashes
      if (thunderState == 0) {
        setRGB(0, 0, 0);
        if (now >= thunderWait) {
          thunderState   = 1;
          thunderFlashes = random(2, 6);
          lastTick       = now;
          strobeState    = false;
        }
      } else {
        // rapid flash burst
        int interval = (int)(50 * speedFactor());
        if (now - lastTick > (unsigned)interval) {
          lastTick    = now;
          strobeState = !strobeState;
          if (strobeState) applyBrightness(255, 255, 255);
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
        if (sosOn) {
          int brt = brightness * 255 / 100;
          setRGB(brt, 0, 0);   // red SOS
        } else {
          setRGB(0, 0, 0);
        }
        sosNext = now + SOS_DUR[sosIdx];
        sosIdx++;
        if (sosIdx >= SOS_LEN) {
          sosIdx  = 0;
          sosNext = now + SOS_DUR[SOS_LEN-1] + 2000;  // 2s pause between repeats
        }
      }
      break;
    }

    case BREATHE: {
      // Very slow sine breath, sleep-friendly warm white
      int interval = (int)(20 * speedFactor());
      if (now - lastTick > (unsigned)interval) {
        lastTick = now;
        phase = (phase + 1) % 256;
        float s = (sin(phase * 2.0 * PI / 256.0) + 1.0) / 2.0;
        // slow it further: only advance phase every other tick
        int v = round(s * 255 * brightness / 100.0);
        // warm white: R full, G 85%, B 60%
        setRGB(v, round(v * 0.85), round(v * 0.60));
      }
      break;
    }

    case PARTY: {
      // Snap cycle R → G → B
      int interval = (int)(150 * speedFactor());
      if (now - lastTick > (unsigned)interval) {
        lastTick = now;
        partyColor = (partyColor + 1) % 3;
        int brt = 255 * brightness / 100;
        if      (partyColor == 0) setRGB(brt, 0,   0);
        else if (partyColor == 1) setRGB(0,   brt, 0);
        else                      setRGB(0,   0,   brt);
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
