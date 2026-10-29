const test=require('node:test'),assert=require('node:assert/strict'),{attributions}=require('../dialogue-attribution.cjs');
test('clear named dialogue and Oak shorthand get exact portraits, never random citizens',()=>{
 const rows=attributions('大木博士：“妙蛙种子、小火龙、杰尼龟——选择与你一起旅行的伙伴吧！”\n小茂已经等在一旁：“选好了吗？出发之前，先和我打一场！”\n博士：“接下来试试。”',{oakContext:true});
 assert.deepEqual(rows.map(x=>x.speaker),['大木博士','小茂','大木博士']);assert.match(rows[0].image,/oak/i);assert.match(rows[2].image,/oak/i);
});
test('known dialogue after a quote is attributed, while unknown narration, JSON and other professors are left alone',()=>{
 const rows=attributions('<initvar>{"a":"b"}</initvar>\n“被太阳吻过？”小茂从窗边走过来。\n“听我说。”某个人喊道。\n博士：“你来了。”');
 assert.equal(rows.length,1);assert.equal(rows[0].speaker,'小茂');assert.equal(rows[0].quote,'被太阳吻过？');
});
