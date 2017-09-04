class Delay {
  constructor(sampleRate, time) {
    this.sampleRate = sampleRate
    this.buf = new Array(sampleRate * 5).fill(0)
    this.wptr = 0
    this.time = time
  }

  set time(value) {
    this.rptr = this.mod(this.wptr - this.sampleRate * value, this.buf.length)
  }

  interp(a, b, ratio) {
    return a + ratio * (b - a)
  }

  mod(n, m) {
    return ((n % m) + m) % m
  }

  process(input) {
    this.buf[this.wptr] = input
    this.wptr = (this.wptr + 1) % this.buf.length

    var ratio = this.rptr % 1
    var rptr = Math.floor(this.rptr)
    this.rptr = (this.rptr + 1) % this.buf.length
    var output = this.interp(
      this.buf[rptr],
      this.buf[Math.floor(this.rptr)],
      ratio
    )
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

  set feedback(value) {
    this._feedback = Math.max(0, Math.min(value, 1))
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
    for (var i = 0; i < params.length; ++i) {
      this.allpass[i].time = params[i].time
      this.allpass[i].gain = params[i].gain
    }
  }

  process(input) {
    for (var i = 0; i < this.allpass.length; ++i) {
      input = this.allpass[i].process(input)
    }
    return input
  }
}

class Freeverb {
  constructor(sampleRate) {
    this.lpcomb = []

    var fixedRate = 25000
    var times = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
    times = times.map(value => value / fixedRate)
    for (var i = 0; i < times.length; ++i) {
      this.lpcomb.push(new LPComb(sampleRate, times[i], 0.3, 0.94))
    }

    var params = [
      { time: 225 / fixedRate, gain: 0.5 },
      { time: 556 / fixedRate, gain: 0.5 },
      { time: 441 / fixedRate, gain: 0.5 },
      { time: 341 / fixedRate, gain: 0.5 }
    ]
    this.allpass = new SerialAllpass(sampleRate, params)
  }

  process(input) {
    var output = 0
    for (var i = 0; i < this.lpcomb.length; ++i) {
      output += this.lpcomb[i].process(input)
    }
    return this.allpass.process(output)
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
    for (var i = 0; i < params.length; ++i) {
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
