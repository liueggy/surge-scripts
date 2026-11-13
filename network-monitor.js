// Surge Network Pro - scheduled monitor
// Runs every minute. Connectivity checks every five minutes.
(function () {
  'use strict';
  var KEY = 'snp_state_v1';
  var CHECK_MS = 300000;
  var RETAIN_MS = 1800000;
  var TIMEOUT = 8;
  var TARGETS = [
    {name:'Google',url:'https://www.google.com/generate_204'},
    {name:'GitHub',url:'https://github.com/'},
    {name:'OpenAI',url:'https://chatgpt.com/'},
    {name:'Cloudflare',url:'https://cp.cloudflare.com/generate_204'}
  ];
  function load() { try { return JSON.parse($persistentStore.read(KEY) || '{}'); } catch (_) { return {}; } }
  function save(s) { $persistentStore.write(JSON.stringify(s),KEY); }
  function probe(url, callback) {
    var start = Date.now();
    try {
      $httpClient.get({url:url,timeout:TIMEOUT},function(err,resp){
        var status = resp && Number(resp.status || resp.statusCode) || 0;
        callback({ok:!err && status>0,ms:!err && status>0?Date.now()-start:null,status:status,error:err?String(err).slice(0,80):null});
      });
    } catch(e) { callback({ok:false,ms:null,status:0,error:String(e).slice(0,80)}); }
  }
  var now=Date.now(), state=load();
  if (!Array.isArray(state.samples)) state.samples=[];
  if (!state.targets || typeof state.targets!=='object') state.targets={};
  function finish() { state.updatedAt=Date.now(); save(state); $done({}); }
  probe('https://cp.cloudflare.com/generate_204',function(result){
    state.samples.push({ts:Date.now(),ms:result.ms,ok:result.ok});
    state.samples=state.samples.filter(function(x){return x && x.ts>=Date.now()-RETAIN_MS && x.ts<=Date.now()+60000;}).slice(-31);
    if (now-(Number(state.checkedAt)||0)<CHECK_MS) return finish();
    state.checkedAt=now;
    var pending=TARGETS.length;
    TARGETS.forEach(function(t){
      probe(t.url,function(r){
        state.targets[t.name]={ok:r.ok,ms:r.ms,status:r.status,error:r.error,ts:Date.now()};
        if (--pending===0) finish();
      });
    });
  });
})();