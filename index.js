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

  var freeverb = new Freeverb(
    sampleRate,
    inputDamp.value,
    inputRoomsize.value
  )
  var rnd = new Rnd(inputSeed.value)
  for (var ch = 0; ch < wave.length; ++ch) {
    freeverb.random(rnd)
    for (var t = 0; t < wave[ch].length; ++t) {
      wave[ch][t] = freeverb.process(wave[ch][t])
    }
  }

  return wave
}

function refresh() {
  var channel = 2

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

  wave.declick(inputDeclickIn.value, inputDeclickOut.value)
  if (checkboxNormalize.value) {
    wave.normalize()
  }
  waveView.set(wave.left)
}


//-- UI.

var audioContext = new AudioContext()
var renderParameters = new RenderParameters(audioContext, 1)
// var renderParameters = new RenderParameters(audioContext, 16)

var wave = new Wave(2)

var divMain = new Div(document.body, "main")
var headingTitle = new Heading(divMain.element, 1, document.title)

var description = new Description(divMain.element)
description.add("", "")

var divWaveform = new Div(divMain.element, "waveform")
var headingWaveform = new Heading(divWaveform.element, 6, "Waveform")
var waveView = new WaveView(divWaveform.element, 512, 256, wave.left, false)

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
  2, 0.02, 8, 0.02, (value) => { refresh() })
var tenMilliSecond = audioContext.sampleRate / 100
var inputDeclickIn = new NumberInput(divMiscControls.element, "Declick In",
  0, 0, tenMilliSecond, 1, refresh)
var inputDeclickOut = new NumberInput(divMiscControls.element, "Declick Out",
  Math.floor(tenMilliSecond / 10), 0, tenMilliSecond, 1, refresh)
var checkboxNormalize = new Checkbox(divMiscControls.element, "Normalize",
  true, refresh)
var checkboxResample = new Checkbox(divMiscControls.element, "16x Sampling",
  true, (checked) => {
    renderParameters.overSampling = checked ? 16 : 1
    refresh()
    play(audioContext, wave)
  }
)

var inputDamp = new NumberInput(divMiscControls.element, "Damp",
  0.2, 0, 1, 0.001, refresh)
var inputRoomsize = new NumberInput(divMiscControls.element, "Roomsize",
  0.84, 0, 1, 0.001, refresh)
var inputSeed = new NumberInput(divMiscControls.element, "Seed",
  0, 0, 65535, 1, refresh)

refresh()

// If startup is succeeded, remove "unsupported" paragaraph.
document.getElementById("unsupported").outerHTML = ""
