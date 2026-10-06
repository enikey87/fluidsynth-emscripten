#include "test.h"
#include "fluidsynth.h"
#include "fluidsynth_priv.h"
#include "fluid_synth.h"
#include "fluid_midi.h"
#include "fluid_chan.h"

/* An application-set channel type must survive a MIDI system reset */
static void test_app_set_type_survives_reset(void)
{
    fluid_settings_t *settings = new_fluid_settings();
    fluid_synth_t *synth = new_fluid_synth(settings);
    TEST_ASSERT(synth != NULL);

    TEST_ASSERT(synth->channel[3]->channel_type == CHANNEL_TYPE_MELODIC);

    TEST_SUCCESS(fluid_synth_set_channel_type(synth, 3, CHANNEL_TYPE_DRUM));

    TEST_SUCCESS(fluid_synth_system_reset(synth));
    TEST_ASSERT(synth->channel[3]->channel_type == CHANNEL_TYPE_DRUM);

    /* a second reset must not wear the flag off either */
    TEST_SUCCESS(fluid_synth_system_reset(synth));
    TEST_ASSERT(synth->channel[3]->channel_type == CHANNEL_TYPE_DRUM);

    /* the typed channel can also be set back to melodic, still sticky */
    TEST_SUCCESS(fluid_synth_set_channel_type(synth, 3, CHANNEL_TYPE_MELODIC));
    TEST_SUCCESS(fluid_synth_system_reset(synth));
    TEST_ASSERT(synth->channel[3]->channel_type == CHANNEL_TYPE_MELODIC);

    delete_fluid_synth(synth);
    delete_fluid_settings(settings);
}

/* Channel 9 keeps its number-derived drum type through resets */
static void test_channel_9_drum_by_default(void)
{
    fluid_settings_t *settings = new_fluid_settings();
    fluid_synth_t *synth = new_fluid_synth(settings);
    TEST_ASSERT(synth != NULL);

    TEST_SUCCESS(fluid_synth_system_reset(synth));
    TEST_ASSERT(synth->channel[9]->channel_type == CHANNEL_TYPE_DRUM);
    TEST_ASSERT(synth->channel[8]->channel_type == CHANNEL_TYPE_MELODIC);
    TEST_ASSERT(synth->channel[10]->channel_type == CHANNEL_TYPE_MELODIC);

    delete_fluid_synth(synth);
    delete_fluid_settings(settings);
}

/* Negative control: a channel never typed by the application reverts to its
 * number-derived type after a GS DT1 "use for rhythm part" message is followed
 * by a reset (the mode-set SysEx triggers one itself). */
static void test_untyped_channel_reverts_after_gs_reset(void)
{
    fluid_settings_t *settings = new_fluid_settings();
    fluid_synth_t *synth = new_fluid_synth(settings);
    /* GS mode set on part 5's address, then "use for rhythm part" = drum */
    const char gs_mode_set[] = { 0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7F, 0x00, 0x41 };
    const char gs_rhythm_part[] = { 0x41, 0x10, 0x42, 0x12, 0x40, 0x16, 0x15, 0x01, 0x14 };
    TEST_ASSERT(synth != NULL);

    TEST_SUCCESS(fluid_synth_sysex(synth, gs_mode_set, sizeof(gs_mode_set), NULL, NULL, NULL, FALSE));
    TEST_ASSERT(synth->channel[5]->channel_type == CHANNEL_TYPE_MELODIC);

    TEST_SUCCESS(fluid_synth_sysex(synth, gs_rhythm_part, sizeof(gs_rhythm_part), NULL, NULL, NULL, FALSE));
    TEST_ASSERT(synth->channel[5]->channel_type == CHANNEL_TYPE_DRUM);

    /* the GS mode-set SysEx performs a system reset: the type set by the
     * message itself must not survive it, only application-set types do */
    TEST_SUCCESS(fluid_synth_sysex(synth, gs_mode_set, sizeof(gs_mode_set), NULL, NULL, NULL, FALSE));
    TEST_ASSERT(synth->channel[5]->channel_type == CHANNEL_TYPE_MELODIC);

    delete_fluid_synth(synth);
    delete_fluid_settings(settings);
}

/* An application-set type also survives the GS resets, not just plain resets */
static void test_app_set_type_survives_gs_reset(void)
{
    fluid_settings_t *settings = new_fluid_settings();
    fluid_synth_t *synth = new_fluid_synth(settings);
    const char gs_mode_set[] = { 0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7F, 0x00, 0x41 };
    TEST_ASSERT(synth != NULL);

    TEST_SUCCESS(fluid_synth_set_channel_type(synth, 3, CHANNEL_TYPE_DRUM));
    TEST_SUCCESS(fluid_synth_sysex(synth, gs_mode_set, sizeof(gs_mode_set), NULL, NULL, NULL, FALSE));
    TEST_ASSERT(synth->channel[3]->channel_type == CHANNEL_TYPE_DRUM);

    delete_fluid_synth(synth);
    delete_fluid_settings(settings);
}

int main(void)
{
    test_app_set_type_survives_reset();
    test_channel_9_drum_by_default();
    test_untyped_channel_reverts_after_gs_reset();
    test_app_set_type_survives_gs_reset();
    return EXIT_SUCCESS;
}
