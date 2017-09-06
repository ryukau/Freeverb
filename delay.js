class Impulse {
  // band limited impulse.
  // length はサンプル数。
  constructor(length) {
    this.length = length
  }

  set length(value) {
    this.P = Math.floor(value)
    this.piPerP = Math.PI / this.P
    var M = (value % 2 === 0) ? value - 1 : value
    this.mPiPerP = M * this.piPerP
  }

  // oscillate(0) === 1
  oscillate(n) {
    var A = Math.sin(this.piPerP * n)
    if (A === 0) { return 1 }
    var B = Math.sin(this.mPiPerP * n) / (A * this.P)
    return Math.max(-1, Math.min(B, 1))
  }
}

class Delay {
  constructor(sampleRate, time) {
    this.sampleRate = sampleRate
    this.buf = new Array(sampleRate * 5).fill(0)
    this.wptr = 0
    this.time = time
  }

  set time(value) {
    var rptr = this.mod(this.wptr - this.sampleRate * value, this.buf.length)
    this.fraction = rptr % 1
    this.rptr = Math.floor(rptr)
  }

  mod(n, m) {
    return ((n % m) + m) % m
  }

  process(input) {
    this.buf[this.wptr] = input
    this.wptr = (this.wptr + 1) % this.buf.length

    var rptr = this.rptr
    this.rptr = (this.rptr + 1) % this.buf.length
    return this.buf[rptr]
      + this.fraction * (this.buf[this.rptr] - this.buf[rptr])
  }
}

class DelayS {
  // Windowed sinc interpolated delay.
  constructor(sampleRate, time) {
    this.halfWinLength = 16
    this.sampleRate = sampleRate
    this.buf = new Array(sampleRate * 5).fill(0)
    this.wptr = 0
    this.time = time
  }

  set time(value) {
    var rptr = this.mod(
      this.wptr - this.sampleRate * value - this.halfWinLength,
      this.buf.length
    )
    this.fraction = rptr % 1
    this.rptr = Math.floor(rptr)
    this.makeWindow()
  }

  makeWindow(fraction) {
    // HannWindow * sinc.
    this.win = new Array(this.halfWinLength * 2).fill(0)
    var length = this.win.length - 1
    for (var i = 0; i < this.win.length; ++i) {
      this.win[i] = Math.sin(Math.PI * i / length)
      this.win[i] *= this.win[i]
      this.win[i] *= this.sinc(this.fraction + i - this.halfWinLength)
    }
    return this.win
  }

  sinc(x) {
    var a = Math.PI * x
    return (a === 0) ? 1 : Math.sin(a) / a
  }

  mod(n, m) {
    return ((n % m) + m) % m
  }

  process(input) {
    this.buf[this.wptr] = input
    this.wptr = (this.wptr + 1) % this.buf.length

    var rptr = this.rptr
    var output = 0
    for (var i = 0; i < this.win.length; ++i) {
      output += this.buf[rptr] * this.win[i]
      rptr = (rptr + 1) % this.buf.length
    }
    this.rptr = (this.rptr + 1) % this.buf.length
    return output
  }
}

class Allpass {
  constructor(sampleRate, time, gain) {
    this.gain = gain
    this.delay = new Delay(sampleRate, time)
    this.buf = 0
  }

  set time(value) {
    this.delay.time = value
  }

  process(input) {
    input += this.gain * this.buf
    var output = this.buf - this.gain * input
    this.buf = this.delay.process(input)
    return output
  }
}

class Comb {
  constructor(sampleRate, time, gain, feedback) {
    this.delay = new Delay(sampleRate, time)
    this.gain = gain
    this.feedback = feedback
    this.buf = 0
  }

  set time(value) {
    this.delay.time = value
  }

  process(input) {
    // feedback.
    input -= this.feedback * this.buf
    this.buf = this.delay.process(input)
    return this.gain * input
  }

  processFF(input) {
    // feed forward.
    return this.gain * (input + this.feedback * this.delay.process(input))
  }
}

class LPComb {
  // https://ccrma.stanford.edu/~jos/pasp/Lowpass_Feedback_Comb_Filter.html
  // damp = 0.2
  // roomsize = 0.84
  constructor(sampleRate, time, damp, roomsize) {
    this.delay = new Delay(sampleRate, time)
    this.damp = damp
    this.roomsize = roomsize
    this.x = 0
    this.buf = 0
  }

  set time(value) {
    this.delay.time = value
  }

  process(input) {
    var gain = this.roomsize * (1 - this.damp) / (1 - this.damp * this.x)
    this.x = input

    input -= gain * this.buf
    this.buf = this.delay.process(input)
    return input
  }
}

class SerialAllpass {
  // params = [{time: t, gain: g}, ...]
  constructor(sampleRate, params) {
    this.allpass = []
    for (var i = 0; i < params.length; ++i) {
      this.allpass.push(new Allpass(
        sampleRate, params[i].time, params[i].gain))
    }
  }

  set params(params) {
    for (var i = 0; i < this.allpass.length; ++i) {
      this.allpass[i].time = params[i].time
      this.allpass[i].gain = params[i].gain
    }
  }

  randomTime(min, max, rnd) {
    var range = max - min
    for (var i = 0; i < this.allpass.length; ++i) {
      this.allpass[i].time = rnd.random() * range + min
    }
  }

  process(input) {
    for (var i = 0; i < this.allpass.length; ++i) {
      input = this.allpass[i].process(input)
    }
    return input
  }

  processMix(input, step) {
    // 途中から取り出すのもあり。
    var mix = 0
    var halfStep = Math.floor(step / 2)
    for (var i = 0; i < this.allpass.length; ++i) {
      input = this.allpass[i].process(input)
      if (i % step === halfStep) {
        mix += input
      }
    }
    return input + mix / 3
  }
}

class Freeverb {
  constructor(
    sampleRate,
    damp,
    roomsize,
    combLength,
    allpassLength,
    allpassGain,
    allpassRandomMultiplier
  ) {
    this.lpcomb = []
    this.damp = damp
    this.roomsize = roomsize
    this.allpassRandomMultiplier = allpassRandomMultiplier
    this.allpassStep = allpassLength

    for (var i = 0; i < combLength; ++i) {
      this.lpcomb.push(new LPComb(
        sampleRate,
        Math.random() * this.allpassRandomMultiplier + 0.04,
        this.damp,
        this.roomsize
      ))
    }

    var params = []
    for (var i = 0; i < allpassLength; ++i) {
      params.push({
        time: Math.random(),
        gain: allpassGain//0.25 + Math.random() * 0.25
      })
    }
    this.allpass = new SerialAllpass(sampleRate, params)
  }

  random(rnd) {
    for (var i = 0; i < this.lpcomb.length; ++i) {
      this.lpcomb[i].time = rnd.random() * this.allpassRandomMultiplier + 0.04
    }
    this.allpass.randomTime(0.005, 0.025, rnd)
  }

  process(input) {
    var output = 0
    for (var i = 0; i < this.lpcomb.length; ++i) {
      output += this.lpcomb[i].process(input)
    }
    // return this.allpass.process(output)
    return this.allpass.processMix(output, this.allpassStep)
  }
}

class ParallelComb {
  // params = [{time: t, gain: g, feedback: f}, ...]
  constructor(sampleRate, params) {
    this.comb = []
    for (var i = 0; i < params.length; ++i) {
      this.comb.push(new Comb(
        sampleRate,
        params[i].time,
        params[i].gain,
        params[i].feedback
      ))
    }
  }

  set params(params) {
    for (var i = 0; i < this.comb.length; ++i) {
      this.comb[i].time = params[i].time
      this.comb[i].gain = params[i].gain
      this.comb[i].feedback = params[i].feedback
    }
  }

  process(input) {
    var output = 0
    for (var i = 0; i < this.comb.length; ++i) {
      output += this.comb[i].process(input)
    }
    return output
  }
}

class SchroederReverberator {
  constructor(sampleRate, paramsAllpass, paramsComb) {
    this.allpass = new SerialAllpass(sampleRate, paramsAllpass)
    this.comb = new ParallelComb(sampleRate, paramsComb)
  }

  random() {

  }

  process(input) {
    return this.comb.process(this.allpass.process(input))
  }
}
