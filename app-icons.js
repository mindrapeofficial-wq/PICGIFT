(()=>{'use strict';
 const actions=[
  ['#refresh,#ai-director-refresh,#notification-refresh,#flux-review-refresh','refresh'],
  ['#ai-director-check','robot'],['#ai-director-dispatch','bell'],['#notification-send','mail'],
  ['.admin-shortcuts a[href="#ai-director-section"]','robot'],['.admin-shortcuts a[href="#users-section"]','user'],
  ['.admin-shortcuts a[href="#notification-section"]','bell'],['.topbar a[href="./#cuenta"]:not(:has(img))','arrow'],
  ['#premium-form button,#global-form button','save'],['.ai-proposal-actions button:first-child','check'],
  ['.ai-proposal-actions button:last-child','close'],['[data-first-steps-done].primary','camera'],
  ['[data-first-steps-done].text-btn','clock'],['.welcome-story [data-first-steps]','book'],
  ['.panel-close','close'],['[data-password-setup]','lock'],['[data-panel="edit"]','edit'],
  ['#profile-edit-form button','save'],['.photo-menu [data-view-job]','eye'],
  ['.photo-menu [data-report-job]','alert'],['.photo-menu [data-delete-job]','trash'],
  ['[data-all-photos]','gallery'],['[data-sort-photos]','layers'],['.photo-menu-toggle','menu']
 ];
 function decorate(root){
  for(const [selector,name] of actions){
   const elements=[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)];
   for(const element of elements){
    if(element.querySelector('svg'))continue;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.setAttribute('class','pg-icon');
    const use=document.createElementNS('http://www.w3.org/2000/svg','use');
    use.setAttribute('href','./assets/icons/picgift.svg#i-'+name);svg.append(use);
    if(element.matches('.panel-close,.photo-menu-toggle'))element.textContent='';
    element.prepend(svg);element.classList.add('pg-icon-control');
   }
  }
 }
 decorate(document);
 // Decorate only inserted controls (gallery and admin proposals), not every DOM mutation.
 new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){
  if(node.nodeType===1&&node.tagName.toLowerCase()!=='svg'&&node.tagName.toLowerCase()!=='use')decorate(node);
 }}).observe(document.body,{childList:true,subtree:true});
})();
