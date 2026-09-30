/* Local, evidence-based teaching. No generated claims about unsearched lines. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.GoTCoach=factory();
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  function facts(before,after,move){
    if(!move||move.pass)return {topic:'endgame',pass:true,captured:0};
    const i=move.y*after.size+move.x,color=move.color,enemy=3-color;
    let captured=0;
    for(let k=0;k<before.board.length;k++)if(before.board[k]===enemy&&after.board[k]!==enemy)captured++;
    const neighbors=[i-after.size,i+after.size,move.x>0?i-1:-1,move.x<after.size-1?i+1:-1].filter(k=>k>=0&&k<after.board.length);
    const groups=new Set();
    for(const k of neighbors)if(before.board[k]===color)groups.add(Math.min(...before.group(k).stones));
    const liberties=after.board[i]===color?after.group(i).libs.size:0;
    const atari=neighbors.some(k=>after.board[k]===enemy&&after.group(k).libs.size===1);
    return {captured,liberties,atari,connected:groups.size>=2,
      topic:captured||atari?'reading':liberties<=1?'attack':groups.size>=2?'shape':after.moveNumber<30?'opening':'review'};
  }
  function evaluate(before,after,move){
    if(!before||!after||!Number.isFinite(before.scoreLeadBlack)||!Number.isFinite(after.scoreLeadBlack)||
       !before.model||before.model!==after.model||before.rules!==after.rules)return null;
    const loss=Math.max(0,(before.scoreLeadBlack-after.scoreLeadBlack)*(move.color===1?1:-1));
    return {loss,low:Math.min(before.visits||0,after.visits||0)<400,visits:Math.min(before.visits||0,after.visits||0),
      model:before.model,best:before.candidates?.[0]||null};
  }
  function describe(f,e,en){
    const t=(z,a)=>en?a:z;
    const observations=[];
    if(f.pass)observations.push(t('这一手停一手。结束前再检查双方死活与边界。','You passed. Check life, death and boundaries before ending.'));
    else {
      if(f.captured)observations.push(t(`这一手提掉了 ${f.captured} 颗对方棋子。`,`This move captured ${f.captured} opposing stones.`));
      if(f.connected)observations.push(t('这一手实接了原本分开的棋块。','This move joined previously separate groups.'));
      if(f.liberties===1)observations.push(t('落子后这块棋只剩一口气，先检查对方能否提走。','Your group has one liberty. Check whether the opponent can capture it.'));
      else observations.push(t(`落子后这块棋有 ${f.liberties} 口气；气多不代表已经做活。`,`Your group now has ${f.liberties} liberties; liberties alone do not prove life.`));
      if(f.atari)observations.push(t('相邻的对方棋块被打吃了，试着读出它的逃跑或反提。','An adjacent opposing group is in atari. Read its escape or counter-capture.'));
    }
    const prediction=e?t(`${e.model} 估计这一手损失约 ${e.loss.toFixed(1)} 目。${e.low?'搜索量较低，仅作参考，不能据此定性好坏。':'这是搜索估计，并非确定结论。'}`,
      `${e.model} estimates about ${e.loss.toFixed(1)} points lost. ${e.low?'Low search budget: treat this as a reference, not a verdict.':'This is a search estimate, not a certainty.'}`):t('暂未取得同模型的前后局面分析，先看棋形观察，不估算损目。','No comparable before/after analysis yet. Use the board observations without a point-loss estimate.');
    const encouragement=e&&!e.low&&e.loss<1?t('这次判断与引擎接近。说说你看到了什么，把方法记住。','Your judgement is close to the engine here. Explain what you noticed to retain the idea.'):
      t('愿意回看这一手就是进步。先读“我走、对方应、我再走”三手，再试一次。','Reviewing this move is a useful step. Read your move, their reply and your response, then try again.');
    return {observations,prediction,encouragement};
  }
  return {facts,evaluate,describe};
});
