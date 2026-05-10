/*
 * led_controller.c
 * RGB LED controller for Arduino Uno (AVR ATmega328P)
 * Compiled with avr-gcc. Replaces the .ino if you prefer plain C.
 *
 * Wiring
 *   Pin 9  (OC1A) -> 220Ω -> R leg of RGB LED
 *   Pin 10 (OC1B) -> 220Ω -> G leg
 *   Pin 11 (OC2A) -> 220Ω -> B leg
 *   Cathode (shortest leg) -> GND
 *
 * Serial commands (9600 baud, newline-terminated)
 *   POWER:ON / POWER:OFF
 *   BRIGHTNESS:0-100
 *   MODE:SOLID / MODE:STROBE / MODE:FADE /
 *   MODE:RAINBOW / MODE:POLICE / MODE:CANDLE / MODE:SUNRISE
 *
 * Build (avr-gcc toolchain)
 *   avr-gcc -mmcu=atmega328p -DF_CPU=16000000UL -Os \
 *           -o led_controller.elf led_controller.c
 *   avr-objcopy -O ihex led_controller.elf led_controller.hex
 *   avrdude -c arduino -p m328p -P /dev/ttyUSB0 -b 115200 \
 *           -U flash:w:led_controller.hex
 */

#include <avr/io.h>
#include <avr/interrupt.h>
#include <util/delay.h>
#include <stdlib.h>   /* abs(), rand() */
#include <string.h>   /* strcmp(), strncmp(), strlen() */
#include <math.h>     /* sin() */
#include <stdint.h>
#include <stdbool.h>

/* Pin definitions */
#define PIN_R   9   /* OC1A – Timer1, 8-bit fast PWM */
#define PIN_G  10   /* OC1B – Timer1 */
#define PIN_B  11   /* OC2A – Timer2 */

/* Convenience macros */
#define F_CPU_MHZ      16000000UL
#define BAUD           9600
#define UBRR_VAL       (F_CPU_MHZ / 16 / BAUD - 1)

#define CLAMP(v,lo,hi) ((v) < (lo) ? (lo) : ((v) > (hi) ? (hi) : (v)))
#define PI_F           3.14159265f

/* Types */
typedef enum {
    MODE_SOLID = 0,
    MODE_STROBE,
    MODE_FADE,
    MODE_RAINBOW,
    MODE_POLICE,
    MODE_CANDLE,
    MODE_SUNRISE
} LedMode;

/* State */
static bool     power_on     = true;
static int      brightness   = 75;   /* 0-100 */
static LedMode  current_mode = MODE_SOLID;

/* Timing */
static uint32_t last_tick    = 0;
static int      phase        = 0;    /* 0-255 generic counter */
static bool     strobe_state = false;

/* Serial line buffer */
#define BUF_SIZE 32
static char     rx_buf[BUF_SIZE];
static uint8_t  rx_idx = 0;

/* millis() implementation */
/*
 * Timer0 is used by the Arduino runtime for millis(). In plain C we
 * replicate it: configure Timer0 in CTC mode with a 1 ms interrupt.
 */
static volatile uint32_t _millis_count = 0;

ISR(TIMER0_COMPA_vect) {
    _millis_count++;
}

static uint32_t millis(void) {
    uint32_t m;
    cli();
    m = _millis_count;
    sei();
    return m;
}

/* UART */
static void uart_init(void) {
    UBRR0H = (uint8_t)(UBRR_VAL >> 8);
    UBRR0L = (uint8_t)(UBRR_VAL);
    UCSR0B = (1 << RXEN0) | (1 << TXEN0);
    UCSR0C = (1 << UCSZ01) | (1 << UCSZ00);  /* 8-N-1 */
}

static int uart_available(void) {
    return (UCSR0A & (1 << RXC0)) ? 1 : 0;
}

static char uart_read(void) {
    while (!(UCSR0A & (1 << RXC0)));
    return (char)UDR0;
}

/* PWM helpers */
/*
 * Timer1 drives pins 9 (OC1A) and 10 (OC1B) in 8-bit fast PWM.
 * Timer2 drives pin  11 (OC2A) in fast PWM.
 */
static void pwm_init(void) {
    /* Pins as output */
    DDRB |= (1 << PB1) | (1 << PB2) | (1 << PB3);  /* 9, 10, 11 */

    /* Timer1: fast PWM 8-bit, non-inverting, prescaler 64 */
    TCCR1A = (1 << COM1A1) | (1 << COM1B1) | (1 << WGM10);
    TCCR1B = (1 << WGM12)  | (1 << CS11)   | (1 << CS10);

    /* Timer2: fast PWM, non-inverting, prescaler 64 */
    TCCR2A = (1 << COM2A1) | (1 << WGM21) | (1 << WGM20);
    TCCR2B = (1 << CS22);
}

static void set_rgb(int r, int g, int b) {
    OCR1A = (uint8_t)CLAMP(r, 0, 255);   /* Pin 9  = R */
    OCR1B = (uint8_t)CLAMP(g, 0, 255);   /* Pin 10 = G */
    OCR2A = (uint8_t)CLAMP(b, 0, 255);   /* Pin 11 = B */
}

static void apply_brightness(int r, int g, int b) {
    set_rgb(r * brightness / 100,
            g * brightness / 100,
            b * brightness / 100);
}

/* HSV → RGB */
static void hsv_to_rgb(int h, int s, int v, int *r, int *g, int *b) {
    if (s == 0) { *r = *g = *b = v; return; }
    int region    = h / 43;
    int remainder = (h - region * 43) * 6;
    int p = (v * (255 - s)) >> 8;
    int q = (v * (255 - ((s * remainder) >> 8))) >> 8;
    int t = (v * (255 - ((s * (255 - remainder)) >> 8))) >> 8;
    switch (region) {
        case 0: *r=v; *g=t; *b=p; break;
        case 1: *r=q; *g=v; *b=p; break;
        case 2: *r=p; *g=v; *b=t; break;
        case 3: *r=p; *g=q; *b=v; break;
        case 4: *r=t; *g=p; *b=v; break;
        default:*r=v; *g=p; *b=q; break;
    }
}

/* Serial parser */
static void process_line(const char *line) {
    if (strcmp(line, "POWER:ON") == 0)  { power_on = true;  return; }
    if (strcmp(line, "POWER:OFF") == 0) { power_on = false; return; }

    if (strncmp(line, "BRIGHTNESS:", 11) == 0) {
        int v = atoi(line + 11);
        brightness = CLAMP(v, 0, 100);
        return;
    }

    if (strncmp(line, "MODE:", 5) == 0) {
        const char *m = line + 5;
        phase = 0;
        if      (strcmp(m, "SOLID")   == 0) current_mode = MODE_SOLID;
        else if (strcmp(m, "STROBE")  == 0) current_mode = MODE_STROBE;
        else if (strcmp(m, "FADE")    == 0) current_mode = MODE_FADE;
        else if (strcmp(m, "RAINBOW") == 0) current_mode = MODE_RAINBOW;
        else if (strcmp(m, "POLICE")  == 0) current_mode = MODE_POLICE;
        else if (strcmp(m, "CANDLE")  == 0) current_mode = MODE_CANDLE;
        else if (strcmp(m, "SUNRISE") == 0) current_mode = MODE_SUNRISE;
    }
}

static void handle_serial(void) {
    while (uart_available()) {
        char c = uart_read();
        if (c == '\n' || c == '\r') {
            if (rx_idx > 0) {
                rx_buf[rx_idx] = '\0';
                process_line(rx_buf);
                rx_idx = 0;
            }
        } else if (rx_idx < BUF_SIZE - 1) {
            rx_buf[rx_idx++] = c;
        }
    }
}

/* Mode runner */
static void run_mode(void) {
    uint32_t now = millis();

    switch (current_mode) {

        case MODE_SOLID:
            apply_brightness(255, 176, 0);   /* warm amber */
            break;

        case MODE_STROBE:
            if (now - last_tick > 80) {
                last_tick    = now;
                strobe_state = !strobe_state;
                if (strobe_state) apply_brightness(255, 255, 255);
                else              set_rgb(0, 0, 0);
            }
            break;

        case MODE_FADE: {
            if (now - last_tick > 12) {
                last_tick = now;
                phase = (phase + 1) % 256;
                float s = (sinf(phase * 2.0f * PI_F / 256.0f) + 1.0f) / 2.0f;
                int   v = (int)(s * 255.0f * brightness / 100.0f);
                set_rgb(v, (int)(v * 0.69f), 0);   /* amber hue */
            }
            break;
        }

        case MODE_RAINBOW: {
            if (now - last_tick > 15) {
                last_tick = now;
                phase = (phase + 1) % 256;
                int r, g, b;
                hsv_to_rgb(phase, 255, 255 * brightness / 100, &r, &g, &b);
                set_rgb(r, g, b);
            }
            break;
        }

        case MODE_POLICE:
            if (now - last_tick > 200) {
                last_tick    = now;
                strobe_state = !strobe_state;
                if (strobe_state) apply_brightness(255, 0,   0);
                else              apply_brightness(0,   0, 255);
            }
            break;

        case MODE_CANDLE: {
            if (now - last_tick > 60) {
                last_tick = now;
                int flicker = (rand() % 76 + 180) * brightness / 100;
                set_rgb(flicker, (int)(flicker * 0.35f), 0);
            }
            break;
        }

        case MODE_SUNRISE: {
            /* Deep red → orange → warm white over ~8 s */
            if (now - last_tick > 40) {
                last_tick = now;
                phase = (phase + 1) % 200;
                float t = phase / 199.0f;
                int r = 255 * brightness / 100;
                int g = (int)(t * 140.0f * brightness / 100.0f);
                int b = (int)(t * t * 80.0f * brightness / 100.0f);
                set_rgb(r, g, b);
            }
            break;
        }
    }
}

/* Timer0 for millis */
static void timer0_init(void) {
    /* CTC mode, 1 ms tick at 16 MHz with prescaler 64: OCR0A = 249 */
    TCCR0A = (1 << WGM01);
    TCCR0B = (1 << CS01) | (1 << CS00);  /* prescaler 64 */
    OCR0A  = 249;
    TIMSK0 = (1 << OCIE0A);
}

/* Entry point */
int main(void) {
    timer0_init();
    pwm_init();
    uart_init();
    sei();           /* enable global interrupts */

    set_rgb(255, 176, 0);   /* warm amber on boot */

    for (;;) {
        handle_serial();
        if (power_on) run_mode();
        else          set_rgb(0, 0, 0);
    }

    return 0;   /* unreachable */
}