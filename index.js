const TWO_PI = 2 * Math.PI

class RenderParameters {
  constructor(audioContext, overSampling) {
    this.audioContext = audioContext
    this.overSampling = overSampling
  }

  get sampleRate() {
    return this._sampleRate
  }

  get overSampling() {
    return this._overSampling
  }

  set overSampling(value) {
    this._overSampling = value
    this._sampleRate = this._overSampling * this.audioContext.sampleRate
  }
}

function play(audioContext, wave) {
  if (checkboxQuickSave.value) {
    save(wave)
  }

  var channel = wave.channels
  var frame = wave.frames
  var buffer = audioContext.createBuffer(channel, frame, audioContext.sampleRate)

  for (var i = 0; i < wave.channels; ++i) {
    var waveFloat32 = new Float32Array(wave.data[i])
    buffer.copyToChannel(waveFloat32, i, 0)
  }

  if (this.source !== undefined) {
    this.source.stop()
  }
  this.source = audioContext.createBufferSource()
  this.source.buffer = buffer
  this.source.connect(audioContext.destination)
  this.source.start()
}

function save(wave) {
  var buffer = Wave.toBuffer(wave, wave.channels)
  var header = Wave.fileHeader(audioContext.sampleRate, wave.channels,
    buffer.length)

  var blob = new Blob([header, buffer], { type: "application/octet-stream" })
  var url = window.URL.createObjectURL(blob)

  var a = document.createElement("a")
  a.style = "display: none"
  a.href = url
  a.download = document.title + "_" + Date.now() + ".wav"
  document.body.appendChild(a)
  a.click()

  // Firefoxでダウンロードできるようにするための遅延。
  setTimeout(() => {
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }, 100)
}

// length is seconds.
function makeWave(length, sampleRate, channel) {
  var waveLength = Math.floor(sampleRate * length)
  var wave = []
  for (var ch = 0; ch < channel; ++ch) {
    wave.push(new Array(waveLength).fill(0))
    wave[ch][0] = 1 // impulse
  }

  // impulse -> *** early reflection *** -> freeverb。
  var freeverb = []
  freeverb.push(new Freeverb(
    sampleRate,
    inputDamp.value,
    inputRoomsize.value,
    inputCombLength.value,
    inputCombDelayMin.value,
    inputCombDelayRange.value,
    inputAllpassLength.value,
    inputAllpassGain.value,
    inputAllpassDelayMin.value,
    inputAllpassDelayRange.value,
    inputAllpassMixStep.value
  ))
  var earlyReflection = new EarlyReflection(
    sampleRate,
    inputERTaps.value,
    inputERRange.value
  )
  var rnd = new Rnd(inputSeed.value)
  for (var ch = 0; ch < wave.length; ++ch) {
    earlyReflection.random(rnd)
    earlyReflection.clearBuffer()
    for (var i = 0; i < freeverb.length; ++i) {
      freeverb[i].random(rnd)
      freeverb[i].clearBuffer()
    }
    for (var t = 0; t < wave[ch].length; ++t) {
      // wave[ch][t] = earlyReflection.process(wave[ch][t])
      // var input = wave[ch][t]
      var input = earlyReflection.process(wave[ch][t])
      wave[ch][t] = freeverb[0].process(input)
      for (var i = 1; i < freeverb.length; ++i) {
        wave[ch][t] += freeverb[i].process(input)
      }
    }
  }

  return wave
}

class WaveViewMulti {
  constructor(parent, channels) {
    this.waveView = []
    for (var i = 0; i < channels; ++i) {
      this.waveView.push(new WaveView(parent, 512, 256, wave.left, false))
    }
  }

  set(wave) {
    for (var ch = 0; ch < this.waveView.length; ++ch) {
      this.waveView[ch].set(wave.data[ch])
    }
  }
}

function refresh() {
  var channel = wave.channels

  if (checkboxResample.value) {
    var raw = makeWave(inputLength.value, renderParameters.sampleRate, channel)
    for (var ch = 0; ch < raw.length; ++ch) {
      wave.data[ch] = Resampler.pass(
        raw[ch],
        renderParameters.sampleRate,
        audioContext.sampleRate
      )
    }
  }
  else {
    wave.data = makeWave(inputLength.value, audioContext.sampleRate, channel)
  }

  if (checkboxTrim.value) {
    wave.trim()
  }
  wave.declick(inputDeclickIn.value, inputDeclickOut.value)
  if (checkboxNormalize.value) {
    wave.normalize()
  }
  waveView.set(wave)
}

function random() {
  inputDamp.random()
  inputRoomsize.random()
  inputCombLength.random()
  inputCombDelayMin.random()
  inputCombDelayRange.random()
  inputAllpassLength.random()
  inputAllpassGain.random()
  inputAllpassDelayMin.random()
  inputAllpassDelayRange.random()
  inputAllpassMixStep.random()
  inputERTaps.random()
  inputSeed.random()
  refresh()
}


//-- UI.

var audioContext = new AudioContext()
var renderParameters = new RenderParameters(audioContext, 16)

var wave = new Wave(2)

var divMain = new Div(document.body, "main")
var headingTitle = new Heading(divMain.element, 1, document.title)

var description = new Description(divMain.element)
description.add("", "")

var divWaveform = new Div(divMain.element, "waveform")
var headingWaveform = new Heading(divWaveform.element, 6, "Waveform")
var waveView = new WaveViewMulti(divWaveform.element, wave.channels)

var divRenderControls = new Div(divMain.element, "renderControls")
var buttonPlay = new Button(divRenderControls.element, "Play",
  () => play(audioContext, wave))
var buttonSave = new Button(divRenderControls.element, "Save",
  () => save(wave))
var buttonRandom = new Button(divRenderControls.element, "Random",
  () => random())
var pullDownMenuRandomType = new PullDownMenu(divRenderControls.element, null,
  () => { })
pullDownMenuRandomType.add("None")
var checkboxQuickSave = new Checkbox(divRenderControls.element, "QuickSave",
  false, (checked) => { })

var divMiscControls = new Div(divMain.element, "MiscControls")
var headingRender = new Heading(divMiscControls.element, 6, "Render Settings")
var inputLength = new NumberInput(divMiscControls.element, "Length",
  2, 0.02, 16, 0.01, (value) => { refresh() })
var tenMilliSecond = audioContext.sampleRate / 100
var inputDeclickIn = new NumberInput(divMiscControls.element, "Declick In",
  2, 0, tenMilliSecond, 1, refresh)
var inputDeclickOut = new NumberInput(divMiscControls.element, "Declick Out",
  Math.floor(tenMilliSecond / 10), 0, tenMilliSecond, 1, refresh)
var checkboxNormalize = new Checkbox(divMiscControls.element, "Normalize",
  true, refresh)
var checkboxResample = new Checkbox(divMiscControls.element, "16x Sampling",
  false, (checked) => {
    renderParameters.overSampling = checked ? 16 : 1
    refresh()
    play(audioContext, wave)
  }
)
var checkboxTrim = new Checkbox(divMiscControls.element, "Trim",
  false, refresh)

var divReverbControls = new Div(divMain.element, "MiscControls")
var headingRender = new Heading(divReverbControls.element, 6, "Reverb")
var inputERTaps = new NumberInput(divReverbControls.element,
  "ER.Taps", 16, 0, 128, 1, refresh)
var inputERRange = new NumberInput(divReverbControls.element,
  "ER.Range", 0.002, 0.001, 0.1, 0.001, refresh)
var inputDamp = new NumberInput(divReverbControls.element,
  "Damp", 0.2, 0, 0.999, 0.001, refresh)
var inputRoomsize = new NumberInput(divReverbControls.element,
  "Roomsize", 0.84, 0, 1, 0.001, refresh)
var inputCombLength = new NumberInput(divReverbControls.element,
  "Comb", 8, 1, 128, 1, refresh)
var inputCombDelayMin = new NumberInput(divReverbControls.element,
  "CombMin", 0.04, 0.0001, 0.1, 0.0001, refresh)
var inputCombDelayRange = new NumberInput(divReverbControls.element,
  "CombRange", 0.03, 0.0001, 0.1, 0.0001, refresh)
var inputAllpassLength = new NumberInput(divReverbControls.element,
  "Allpass", 4, 1, 128, 1, refresh)
var inputAllpassGain = new NumberInput(divReverbControls.element,
  "AllpassGain", 0.5, 0.01, 1, 0.01, refresh)
var inputAllpassDelayMin = new NumberInput(divReverbControls.element,
  "AllpassMin", 0.005, 0.0001, 0.1, 0.0001, refresh)
var inputAllpassDelayRange = new NumberInput(divReverbControls.element,
  "AllpassRange", 0.025, 0.0001, 0.1, 0.0001, refresh)
var inputAllpassMixStep = new NumberInput(divReverbControls.element,
  "AllpassMixStep", 0, 0, 16, 1, refresh)
var inputSeed = new NumberInput(divReverbControls.element,
  "Seed", 0, 0, 65535, 1, refresh)

refresh()

// If startup is succeeded, remove "unsupported" paragaraph.
document.getElementById("unsupported").outerHTML = ""
