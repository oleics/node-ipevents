
module.exports = {
  reg: reg
  , add: add
  , display: display
}

var util = require('util')
  , sampler = {}

function reg(name) {
  sampler[name] = sampler[name] || []
}

function add(name, ms) {
  sampler[name].push(ms)
}

function display() {
  var profiles = []
  
  Object.keys(sampler).forEach(function(name) {
    profiles.push(calc(name))
    sampler[name] = []
  })
  
  profiles.sort(function(a,b) {
    if(a.avg < b.avg) return -1
    if(a.avg == b.avg) return 0
    return 1
  })
  
  var out = ''
  out += util.format(
    '%s %s %s %s %s %s\n'
    , pad('num', 8)
    , pad('sum', 8)
    , pad('avg', 8)
    , pad('min', 8)
    , pad('max', 8)
    , 'name'
  )
  profiles.forEach(function(p) {
    // console.log(p)
    out += util.format(
      '%s %s %s %s %s %s\n'
      , pad(p.num, 8)
      , pad(p.sum, 8)
      , pad(p.avg.toFixed(3), 8)
      , pad(p.min, 8)
      , pad(p.max, 8)
      , p.name
    )
  })
  console.log(out)
}

function calc(name) {
  var p = sampler[name]
    , num = p.length
    , sum = p.reduce(function(a, b) { return a + b }, 0)
    , avg = sum / num
    , min = p.reduce(function(a, b) { return Math.min(a, b) }, Infinity)
    , max = p.reduce(function(a, b) { return Math.max(a, b) }, 0)
  return {
    name: name
    , num: num
    , sum: sum
    , avg: avg
    , min: min
    , max: max
  }
}

function pad(v,n) {
  if(v.length>n) return v
  return (new Array(n+1).join(' ')+v).slice(-1*n)
}
