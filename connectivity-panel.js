// Surge Network Pro - per-site reachability panel
(function(){
 'use strict';
 var s;try{s=JSON.parse($persistentStore.read('snp_state_v1')||'{}');}catch(_){s={};}
 var now=Date.now(),names=['Google','GitHub','OpenAI','Cloudflare'];
 var lines=names.map(function(name){
   var x=s.targets&&s.targets[name];
   if(!x)return '○ '+name+' · 尚未检测';
   var age=Math.max(0,Math.floor((now-x.ts)/60000));
   return (x.ok?'✓ ':'✕ ')+name+' · '+(x.ok?x.ms+' ms':'失败')+(x.status?' (HTTP '+x.status+')':'')+' · '+age+'m前';
 });
 lines.push('说明：HTTP 可达 ≠ 网站业务正常');
 lines.push('🕒 '+(s.checkedAt?Math.floor((now-s.checkedAt)/60000)+' 分钟前检测':'等待定时任务'));
 $done({title:'网站连通性',content:lines.join('\n'),style:'info'});
})();