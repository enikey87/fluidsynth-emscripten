#include "test.h"
#include "fluidsynth.h"
#include "fluidsynth_priv.h"
#include "fluid_synth.h"
#include "fluid_midi.h"

/* Two tracks: track 0 has events on channel 2, track 1 on channels 3 and 9. */
static const unsigned char midi[] = {
    'M', 'T', 'h', 'd', 0, 0, 0, 6, 0, 1, 0, 2, 0, 96,
    'M', 'T', 'r', 'k', 0, 0, 0, 16,
    0, 0xb2, 7, 100,               /* CC7 100 on channel 2 */
    0, 0x92, 60, 100,              /* note on channel 2 */
    0, 0x82, 60, 0,                /* note off */
    0, 0xff, 0x2f, 0,
    'M', 'T', 'r', 'k', 0, 0, 0, 24,
    0, 0xb3, 7, 50,                /* CC7 50 on channel 3 */
    0, 0xb9, 7, 50,                /* CC7 50 on channel 9 */
    0, 0x93, 61, 100,              /* note on channel 3 */
    0, 0x99, 62, 100,              /* note on channel 9 */
    0, 0x83, 61, 0,
    0, 0x89, 62, 0,
    0, 0xff, 0x2f, 0
};

typedef struct
{
    int notes[4];
    int controls[4];
    int note_count;
    int control_count;
} event_log;

static int log_event(void *data, fluid_midi_event_t *event)
{
    event_log *log = data;

    if(event->type == NOTE_ON)
    {
        log->notes[log->note_count++] = event->channel;
    }
    else if(event->type == CONTROL_CHANGE)
    {
        log->controls[log->control_count++] = event->channel;
    }

    return FLUID_OK;
}

/* Runs the fixture to completion and records the channels events arrive on. */
static void play_midi(fluid_synth_t *synth, const int *map, int ntracks, event_log *log)
{
    fluid_player_t *player = new_fluid_player(synth);
    int blocks = 0;

    TEST_ASSERT(player != NULL);
    log->note_count = 0;
    log->control_count = 0;

    if(map != NULL)
    {
        TEST_SUCCESS(fluid_player_set_channel_map(player, map, ntracks));
    }

    TEST_SUCCESS(fluid_player_set_playback_callback(player, log_event, log));
    TEST_SUCCESS(fluid_player_add_mem(player, midi, sizeof(midi)));
    TEST_SUCCESS(fluid_player_play(player));

    while(fluid_player_get_status(player) == FLUID_PLAYER_PLAYING && blocks < 100)
    {
        TEST_SUCCESS(fluid_synth_process(synth, 4096, 0, NULL, 0, NULL));
        blocks++;
    }

    delete_fluid_player(player);
}

/* Without a table the built-in layout applies: track 0 keeps its channel,
 * track 1 keeps channel 9 (shared drums). */
static void test_no_map_keeps_builtin_layout(void)
{
    fluid_settings_t *settings = new_fluid_settings();
    fluid_synth_t *synth = new_fluid_synth(settings);
    event_log log;
    TEST_ASSERT(synth != NULL);

    play_midi(synth, NULL, 0, &log);

    /* 0 * 10 + 2, 1 * 10 + 3, and channel 9 shared as written */
    TEST_ASSERT(log.note_count == 3 && log.notes[0] == 2 && log.notes[1] == 13 && log.notes[2] == 9);
    TEST_ASSERT(log.control_count == 3 && log.controls[0] == 2 && log.controls[1] == 13 && log.controls[2] == 9);

    delete_fluid_synth(synth);
    delete_fluid_settings(settings);
}

/* A table routes track/channel pairs to other synth channels; -1 cells and
 * tracks beyond the table pass through unchanged. */
static void test_map_routes_channels(void)
{
    fluid_settings_t *settings = new_fluid_settings();
    fluid_settings_setint(settings, "synth.midi-channels", 32);
    fluid_synth_t *synth = new_fluid_synth(settings);
    /* track 0: channel 2 -> 7; track 1: channel 9 -> 19, channel 3 -> -1 */
    int map[32];
    int i;
    event_log log;
    TEST_ASSERT(synth != NULL);

    for(i = 0; i < 32; i++)
    {
        map[i] = -1;
    }
    map[0 * 16 + 2] = 7;
    map[1 * 16 + 9] = 19;

    play_midi(synth, map, 2, &log);

    /* track 0 channel 2 -> 7, track 1 channel 9 -> 19; the -1 cell for
     * channel 3 leaves those events on the channel as written in the file */
    TEST_ASSERT(log.note_count == 3 && log.notes[0] == 7 && log.notes[1] == 3 && log.notes[2] == 19);
    TEST_ASSERT(log.control_count == 3 && log.controls[0] == 7 && log.controls[1] == 3 && log.controls[2] == 19);

    delete_fluid_synth(synth);
    delete_fluid_settings(settings);
}

/* A target outside the synth's MIDI channel count fails the file load: the
 * player finishes without delivering any event. */
static void test_map_target_out_of_range_fails_load(void)
{
    fluid_settings_t *settings = new_fluid_settings();
    fluid_settings_setint(settings, "synth.midi-channels", 16);
    fluid_synth_t *synth = new_fluid_synth(settings);
    int map[16];
    int i;
    event_log log;
    TEST_ASSERT(synth != NULL);

    for(i = 0; i < 16; i++)
    {
        map[i] = -1;
    }
    map[0 * 16 + 2] = 16; /* == synth.midi-channels: one past the end */

    play_midi(synth, map, 1, &log);

    TEST_ASSERT(log.note_count == 0 && log.control_count == 0);

    delete_fluid_synth(synth);
    delete_fluid_settings(settings);
}

static void test_set_channel_map_rejects_invalid_arguments(void)
{
    fluid_settings_t *settings = new_fluid_settings();
    fluid_synth_t *synth = new_fluid_synth(settings);
    fluid_player_t *player = new_fluid_player(synth);
    int map[16];
    int i;
    TEST_ASSERT(player != NULL);

    for(i = 0; i < 16; i++)
    {
        map[i] = -1;
    }

    TEST_ASSERT(fluid_player_set_channel_map(player, NULL, 1) == FLUID_FAILED);
    TEST_ASSERT(fluid_player_set_channel_map(player, map, 0) == FLUID_FAILED);
    TEST_ASSERT(fluid_player_set_channel_map(player, map, -1) == FLUID_FAILED);
    TEST_ASSERT(fluid_player_set_channel_map(player, map, MAX_NUMBER_OF_TRACKS + 1) == FLUID_FAILED);

    /* -2 is reserved for dropping events and must not silently route */
    map[0] = -2;
    TEST_ASSERT(fluid_player_set_channel_map(player, map, 1) == FLUID_FAILED);

    map[0] = 0;
    TEST_SUCCESS(fluid_player_set_channel_map(player, map, 1));

    delete_fluid_player(player);
    delete_fluid_synth(synth);
    delete_fluid_settings(settings);
}

int main(void)
{
    test_no_map_keeps_builtin_layout();
    test_map_routes_channels();
    test_map_target_out_of_range_fails_load();
    test_set_channel_map_rejects_invalid_arguments();
    return EXIT_SUCCESS;
}
