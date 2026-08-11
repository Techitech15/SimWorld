# Generate the raw effect-sound material with Stable Audio 3 Medium.
#
# This is the audio counterpart of tools/generate-sprites.mjs, with one honest
# difference: sprites are deterministic from this repository alone, audio is
# not. Reproducing these files needs the model weights, the same launcher and
# the same GPU, so what this script preserves is the *order* - the prompt, the
# seed and the requested duration for every sound. That is enough to re-derive
# a sound, review why it sounds the way it does, and change one without
# touching the other twelve (docs/design-phase15-audio.md 9.1).
#
# Raw output lands in Stable Audio's own outputs directory as 44.1kHz stereo
# float32 WAV. It is NOT shippable as-is: the spec (同 5章) wants mono, peak at
# or below -3 dBFS, no leading silence and durations down to 0.05s, and the
# model's minimum duration is 1s. tools/process-audio.mjs does that pass and
# writes the result into src/assets/audio/.
#
#   powershell -ExecutionPolicy Bypass -File tools/generate-audio.ps1
#   node tools/process-audio.mjs
#
# Prerequisites live outside this repository (see the Dev Vault note "Claude
# Codeでローカル音楽・効果音生成 調査レポート"): C:\Dev\StableAudio3 with its
# own venv, CUDA PyTorch and the gated stabilityai/stable-audio-3-medium
# weights. Run C:\Dev\StableAudio3\verify-local.ps1 first if anything fails.

param(
    [string]$Launcher = 'C:\Dev\StableAudio3\generate.ps1',
    [string]$OutDir = 'C:\Dev\StableAudio3\outputs\simworld',
    # Regenerate only these names (matched against Name), e.g. -Only build_1,animal_2
    [string[]]$Only = @()
)

$ErrorActionPreference = 'Stop'

# Name = the sound's name in src/ui/sfx.ts. A trailing _<digit> is a variant:
# src/assets/audio.ts strips it, so build_1/build_2/build_3 are all `build` and
# one is chosen per play. Variants exist for the two sounds that repeat most
# (5章: "`build` と `animal` で効果が大きい").
#
# Duration is what the *model* is asked for, not what ships. Everything is
# generated with room to spare and trimmed afterwards, because the model floor
# is 1s and the shortest sound the spec wants is 0.05s.
$Sounds = @(
    # --- alarm: unmistakable, rare, never softened -------------------------
    @{ Name = 'raid'; Seed = 4201; Duration = 3
       Prompt = 'single deep war horn blast, low brass alarm call, one long urgent warning note, distant hill fort, natural decay, no music, no voice' }
    @{ Name = 'alert'; Seed = 4202; Duration = 2
       Prompt = 'two short low wooden alert knocks, dull hollow warning taps, close microphone, dry room, quick decay, no music, no voice' }
    @{ Name = 'death'; Seed = 4203; Duration = 3
       Prompt = 'single deep bell toll, low mournful resonance sinking slowly, distant stone hall, long natural fade, no music, no voice' }
    @{ Name = 'breakdown'; Seed = 4204; Duration = 2
       Prompt = 'unstable wavering metallic tone, detuned wobbling resonance, unsettling and irregular, close microphone, medium decay, no music, no voice' }

    # --- event: a response to something the player did or waited on --------
    @{ Name = 'complete'; Seed = 4211; Duration = 2
       Prompt = 'short bright rising two note wooden chime, clean positive completion cue, close microphone, quick decay, no music, no voice' }
    @{ Name = 'research'; Seed = 4212; Duration = 2
       Prompt = 'bright rising three note glass chime, clear discovery cue, light shimmering tail, close microphone, no music, no voice' }
    @{ Name = 'trade'; Seed = 4213; Duration = 2
       Prompt = 'a few small coins clinking together with one tiny bell, close microphone, dry market stall, fast decay, no music, no voice' }
    @{ Name = 'arrival'; Seed = 4214; Duration = 2
       Prompt = 'warm rising three note wooden flute phrase, gentle welcoming cue, close microphone, short soft tail, no music, no voice' }
    @{ Name = 'illness'; Seed = 4215; Duration = 2
       Prompt = 'short descending dull muted tone, clouded falling pitch, soft and heavy, close microphone, medium decay, no music, no voice' }

    # --- ambient: quiet, frequent, thinned hardest -------------------------
    # These four are the ones that decide whether the game reads as noisy
    # (5章: "迷ったら小さく・短く・柔らかく").
    @{ Name = 'place'; Seed = 4221; Duration = 1
       Prompt = 'one very short soft wooden click, single light fingertip tap on wood, close microphone, completely dry, instant decay, no reverb, no music, no voice' }
    @{ Name = 'build_1'; Seed = 4231; Duration = 1
       Prompt = 'single soft wooden mallet tap on a wooden plank, one short dry knock, close microphone, small workshop, fast decay, no reverb tail, no music, no voice' }
    @{ Name = 'build_2'; Seed = 4232; Duration = 1
       Prompt = 'single muffled wooden mallet knock on a thick beam, low soft thud, close microphone, dry workshop, fast decay, no reverb tail, no music, no voice' }
    @{ Name = 'build_3'; Seed = 4233; Duration = 1
       Prompt = 'single light wooden hammer tap on a small plank, soft high knock, close microphone, dry workshop, fast decay, no reverb tail, no music, no voice' }
    @{ Name = 'animal_1'; Seed = 4241; Duration = 2
       Prompt = 'one distant soft deer call across an open meadow, faint and far away, distant microphone, quiet natural outdoor air, no music, no voice' }
    @{ Name = 'animal_2'; Seed = 4242; Duration = 2
       Prompt = 'one distant soft goat bleat in a far pasture, faint and gentle, distant microphone, quiet natural outdoor air, no music, no voice' }
    @{ Name = 'animal_3'; Seed = 4243; Duration = 2
       Prompt = 'one distant small bird call in a far treeline, faint and short, distant microphone, quiet natural outdoor air, no music, no voice' }
    @{ Name = 'notify'; Seed = 4251; Duration = 2
       Prompt = 'one soft small bell ding, gentle muted chime, close microphone, short warm decay, no music, no voice' }

    # --- BGM ---------------------------------------------------------------
    # `_day` / `_night` are not numeric suffixes, so src/assets/audio.ts keeps
    # them as two separate sounds rather than variants of one (soundNameOf).
    # 60s rather than the 120s the spec allows: these ship as mono 16-bit WAV
    # (no encoder in this toolchain), so length is bytes, and the single-file
    # HTML budget is the binding constraint - see docs/design-notes.md.
    #
    # Stable Audio does not guarantee that the last sample meets the first, so
    # "seamless looping feel" in the prompt is a nudge, not a contract. Whether
    # the seam is audible has to be judged by ear.
    @{ Name = 'bgm_day'; Seed = 4301; Duration = 60
       Prompt = 'calm pastoral fantasy colony theme, instrumental, 70 BPM, soft nylon guitar and warm strings, gentle light hand percussion, sparse unobtrusive arrangement that stays out of the way, warm intimate mix, seamless looping feel, no vocals' }
    @{ Name = 'bgm_night'; Seed = 4302; Duration = 60
       Prompt = 'quiet nocturnal fantasy colony theme, instrumental, 60 BPM, soft low synth pads and distant sparse piano, very still and calm, minimal arrangement, warm dark mix, seamless looping feel, no vocals' }
)

if (-not (Test-Path $Launcher)) {
    throw "Stable Audio launcher not found at $Launcher. See the header of this file."
}
if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
}

# Invoked as `powershell -File this.ps1 -Only bgm_day,bgm_night`, PowerShell
# hands -Only the single *string* "bgm_day,bgm_night" rather than two elements:
# -File passes arguments verbatim instead of parsing them as expressions. Split
# here so both that form and a real array (dot-sourced) behave the same.
$Only = @($Only | ForEach-Object { $_ -split ',' } | Where-Object { $_ -ne '' })

$targets = if ($Only.Count -gt 0) { $Sounds | Where-Object { $Only -contains $_.Name } } else { $Sounds }
if ($targets.Count -eq 0) { throw "No sounds matched -Only $($Only -join ',')" }

$total = $targets.Count
$index = 0
$started = Get-Date

foreach ($sound in $targets) {
    $index++
    $out = Join-Path $OutDir "$($sound.Name).wav"
    Write-Output "[$index/$total] $($sound.Name) (seed $($sound.Seed), $($sound.Duration)s)"
    # The launcher writes progress bars and a torch deprecation warning to
    # stderr. Under Windows PowerShell 5.1 a native command's stderr becomes an
    # ErrorRecord, so with $ErrorActionPreference = 'Stop' a single warning line
    # aborts the whole run - and it did, on the first sound. Let stderr through
    # untouched (no 2>&1) and relax the preference just around the call; the
    # real check is whether the file appeared, which is tested right below.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    powershell -ExecutionPolicy Bypass -File $Launcher `
        -Prompt $sound.Prompt `
        -Duration $sound.Duration `
        -Seed $sound.Seed `
        -Output $out | Out-Null
    $ErrorActionPreference = $previous
    if (-not (Test-Path $out)) {
        throw "Generation produced no file for $($sound.Name) at $out"
    }
    Write-Output "        -> $out ($((Get-Item $out).Length) bytes)"
}

Write-Output ""
Write-Output "Generated $total file(s) into $OutDir in $([int]((Get-Date) - $started).TotalSeconds)s."
Write-Output "Next: node tools/process-audio.mjs"
