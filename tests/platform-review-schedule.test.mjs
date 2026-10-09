import test from 'node:test';
import assert from 'node:assert/strict';
import {HOUR,maxPerHour,recentAttempts,remainingSlots,eligibleAvatars,isProviderBlocked} from '../lib/platformAutoReviewSchedule.mjs';
const now=Date.parse('2026-10-08T12:00:00.000Z');
test('hourly limit is clamped to at most five',()=>{
 assert.equal(maxPerHour(999),5);assert.equal(maxPerHour(0),1);assert.equal(maxPerHour(3),3);
});
test('rolling window counts exactly five and allows after one hour',()=>{
 const d={autoReview:{attempts:Array.from({length:5},(_,i)=>({id:`avtr_${i}`,at:new Date(now-i*1000).toISOString()}))}};
 assert.equal(remainingSlots(d,now,5),0);
 assert.equal(remainingSlots(d,now+HOUR+1,5),5);
});
test('stale attempts excluded from window',()=>{
 assert.equal(recentAttempts([{at:new Date(now-HOUR).toISOString()},{at:new Date(now-5000).toISOString()}],now).length,1);
});
test('manual suggestions and pending retries are excluded',()=>{
 const d={avatars:[{id:'a',autoReviewSuggestion:['PC']},{id:'b',autoReviewNextTryAt:new Date(now+HOUR).toISOString()},{id:'c',name:'Eligible'}]};
 assert.deepEqual(eligibleAvatars(d,now).map(a=>a.id),['c']);
});
test('provider blocks and cooldowns stop runs',()=>{
 assert.equal(isProviderBlocked({autoReview:{blocked:true}},now),true);
 assert.equal(isProviderBlocked({autoReview:{pausedUntil:new Date(now+HOUR).toISOString()}},now),true);
 assert.equal(isProviderBlocked({autoReview:{pausedUntil:new Date(now-HOUR).toISOString()}},now),false);
});
