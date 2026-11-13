// Surge Network Pro dashboard
(function(){
'use strict';
var KEY='snp_state_v1';
function read(){try{return JSON.parse($persistentStore.read(KEY)||'{}')}catch(e){return {}}}
function fmt(n){n=Number(n);if(!isFinite(n)||n<0)return '-';var u=['B','KB','MB','GB','TB'],i=0;while(n>=1024&&i<4){n/=1024;i++}return n.toFixed(i&&n<10?1:0)+' '+u[i]}
function policy(){try{var d=($surge.selectGroupDetails()||{}).decisions||{};return d['节点选择']||d['智能助理']||'未配置策略组'}catch(e){return '未知'}}
function spark(a){if(!a.length)return '暂无';var good=a.filter(function(x){return x.ok&&typeof x.ms==='number'}).map(function(x){return x.ms});if(!good.length)return '×';var lo=Math.min.apply(null,good),hi=Math.max.apply(null,good),b='▁▂▃▄▅▆▇█';return a.slice(-20).map(function(x){return !x.ok||typeof x.ms!=='number'?'×':b.charAt(hi===lo?0:Math.min(7,Math.floor((x.ms-lo)/(hi-lo)*7)))}).join('')}
var s=read(),now=Date.now(),a=(Array.isArray(s.samples)?s.samples:[]).filter(function(x){return x.ts>=now-1800000}),good=a.filter(function(x){return x.ok&&typeof x.ms==='number'}),avg=good.length?Math.round(good.reduce(function(v,x){return v+x.ms},0)/good.length):null,rate=a.length?Math.round(100*good.length/a.length):null,last=a.length?a[a.length-1]:null;
function render(t){var down=0,up=0;if(t){Object.keys(t).forEach(function(k){var x=t[k]||{};down+=Number(x.inCurrentSpeed)||0;up+=Number(x.outCurrentSpeed)||0})}
var names=['Google','GitHub','OpenAI','Cloudflare'],failed=names.filter(function(n){return s.targets&&s.targets[n]&&!s.targets[n].ok}),age=s.updatedAt?Math.round((now-s.updatedAt)/60000):null;
var lines=['🧭 '+policy(),'⚡ '+(last?(last.ok?last.ms+' ms':'探测失败'):'等待采样')+' · 均值 '+(avg===null?'-':avg+' ms'),t?'📶 ↓'+fmt(down)+'/s ↑'+fmt(up)+'/s':'📶 流量读取失败','📈 '+spark(a),'📊 30min 成功率 '+(rate===null?'-':rate+'%')+' · '+a.length+' 样本','🌐 '+(s.checkedAt?'异常 '+failed.length+'/4':'尚未检测'),'🕒 '+(age===null?'暂无数据':age+' 分钟前更新')];$done({title:'Surge Network Pro',content:lines.join('\n'),style:age===null||age>5||(last&&!last.ok)?'alert':'info'})}
try{$httpAPI('GET','/v1/traffic',null,function(r){render(r&&r.connector?r.connector:null)})}catch(e){render(null)}
})();