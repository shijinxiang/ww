(() => {
  const bank = window.QUESTION_BANK;
  const questions = bank.questions;
  const units = bank.units;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const storageKey = "xiGaiQuizProgress.v2";
  const legacyStorageKey = "xiGaiQuizProgress.v1";
  const defaultStore = { wrong: [], starred: [], history: {}, preferences: { effectsEnabled: true } };
  let store = loadStore();
  let session = createEmptySession();

  function createEmptySession(list = [], mode = "practice") {
    return {
      list,
      mode,
      index: 0,
      submitted: false,
      selected: [],
      score: 0,
      answered: 0,
      answerLog: [],
      completed: false
    };
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(storageKey) || localStorage.getItem(legacyStorageKey);
      const parsed = JSON.parse(raw || "{}");
      return {
        ...defaultStore,
        ...parsed,
        preferences: { ...defaultStore.preferences, ...(parsed.preferences || {}) }
      };
    } catch {
      return { ...defaultStore, preferences: { ...defaultStore.preferences } };
    }
  }

  function saveStore() {
    localStorage.setItem(storageKey, JSON.stringify(store));
    renderDashboard();
    renderSavedLists();
    renderPracticeMiniStats();
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function shuffle(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function formatAnswer(answer) { return answer.split("").join("、"); }

  function answerText(q) {
    const keys = q.answer.split("");
    return keys.map(k => {
      const opt = q.options.find(o => o.key === k);
      return `${k}${opt ? `：${opt.text}` : ""}`;
    }).join("；");
  }

  function isSameAnswer(a, b) { return a.slice().sort().join("") === b.split("").sort().join(""); }
  function getQuestion(id) { return questions.find(q => q.id === id); }
  function historyOf(id) { return store.history[id] || { attempts: 0, correct: 0 }; }

  function setView(name) {
    $$(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.view === name));
    $$(".view").forEach(view => view.classList.toggle("active", view.id === `view-${name}`));
    if (name === "practice") syncCountDefault(false);
    if (name === "bank") renderBankList();
    if (name === "saved") renderSavedLists();
    window.location.hash = name;
  }

  function initFilters() {
    const options = [`<option value="all">全部单元</option>`]
      .concat(units.map(u => `<option value="${escapeHTML(u.id)}">${escapeHTML(u.title)}</option>`))
      .join("");
    $("#unitFilter").innerHTML = options;
    $("#bankUnitFilter").innerHTML = options;
  }

  function renderDashboard() {
    const doneIds = Object.keys(store.history || {});
    const correctTotal = doneIds.reduce((sum, id) => sum + (store.history[id].correct || 0), 0);
    const attemptsTotal = doneIds.reduce((sum, id) => sum + (store.history[id].attempts || 0), 0);
    const rate = attemptsTotal ? Math.round((correctTotal / attemptsTotal) * 100) : 0;
    const typeCount = questions.reduce((acc, q) => (acc[q.type] = (acc[q.type] || 0) + 1, acc), {});
    $("#statsGrid").innerHTML = [
      [questions.length, "题目总数"],
      [units.length, "单元数量"],
      [store.wrong.length, "错题"],
      [`${rate}%`, "累计正确率"],
      [typeCount.single || 0, "单选题"],
      [typeCount.multiple || 0, "多选题"],
      [typeCount.judge || 0, "判断题"],
      [store.starred.length, "收藏题"]
    ].map(([num, label]) => `<div class="stat"><strong>${num}</strong><span>${label}</span></div>`).join("");
    $("#footerTotal").textContent = questions.length;

    $("#unitProgress").innerHTML = units.map(u => {
      const unitQs = questions.filter(q => q.unitId === u.id);
      const done = unitQs.filter(q => store.history[q.id]?.attempts > 0).length;
      const pct = unitQs.length ? Math.round(done / unitQs.length * 100) : 0;
      return `<div class="unit-progress-item">
        <div class="unit-progress-top"><strong>${escapeHTML(u.title)}</strong><span>${done}/${unitQs.length}</span></div>
        <div class="bar" aria-label="${escapeHTML(u.title)}进度"><span style="width:${pct}%"></span></div>
      </div>`;
    }).join("");
  }

  function renderPracticeMiniStats() {
    const all = questions.length;
    const done = Object.values(store.history).filter(h => h.attempts > 0).length;
    $("#practiceMiniStats").innerHTML = `
      已做过：<strong>${done}</strong> / ${all}<br>
      错题：<strong>${store.wrong.length}</strong><br>
      收藏：<strong>${store.starred.length}</strong>
    `;
    const effectsToggle = $("#effectsToggle");
    if (effectsToggle) effectsToggle.checked = store.preferences.effectsEnabled !== false;
  }

  function getFilteredPool() {
    const unit = $("#unitFilter").value;
    const type = $("#typeFilter").value;
    const poolMode = $("#poolFilter").value;
    let pool = questions.slice();
    if (unit !== "all") pool = pool.filter(q => q.unitId === unit);
    if (type !== "all") pool = pool.filter(q => q.type === type);
    if (poolMode === "wrong") pool = pool.filter(q => store.wrong.includes(q.id));
    if (poolMode === "starred") pool = pool.filter(q => store.starred.includes(q.id));
    if (poolMode === "unseen") {
      const unseen = pool.filter(q => !store.history[q.id]?.attempts);
      const seen = pool.filter(q => store.history[q.id]?.attempts);
      pool = unseen.concat(seen);
    }
    return pool;
  }

  function getPool() {
    const poolMode = $("#poolFilter").value;
    let pool = getFilteredPool();
    if ($("#orderFilter").value === "shuffle" && poolMode !== "unseen") pool = shuffle(pool);
    return pool;
  }

  function syncCountDefault(force = true) {
    const countInput = $("#countInput");
    const hint = $("#countHint");
    if (!countInput) return;
    const max = getFilteredPool().length;
    countInput.max = String(Math.max(max, 1));
    if (force) countInput.value = String(Math.max(max, 1));
    const unitName = $("#unitFilter").selectedOptions[0]?.textContent || "当前范围";
    hint.textContent = max ? `${unitName} 当前可练 ${max} 题，默认已填最大题数` : "当前条件下暂无题目";
  }

  function startPractice(quick = false, overrideList = null, mode = "practice") {
    if (quick) {
      $("#unitFilter").value = "all";
      $("#typeFilter").value = "all";
      $("#poolFilter").value = "all";
      $("#orderFilter").value = "shuffle";
      $("#countInput").value = 20;
    }
    let pool = overrideList || getPool();
    if (!overrideList) {
      const fallback = pool.length || 1;
      const count = Math.max(1, Math.min(Number($("#countInput").value || fallback), fallback));
      pool = pool.slice(0, count);
    }
    session = createEmptySession(pool, mode);
    setView("practice");
    renderQuestion();
  }

  function renderQuestion() {
    const box = $("#questionBox");
    if (!session.list.length) {
      box.className = "question-empty";
      box.innerHTML = `<h2>没有匹配的题目</h2><p class="muted">请调整左侧筛选条件，或先清空“只刷错题/收藏”的限制。</p>`;
      return;
    }
    box.className = "question-card";
    const q = session.list[session.index];
    const hist = historyOf(q.id);
    const isStarred = store.starred.includes(q.id);
    const isWrong = store.wrong.includes(q.id);
    const isLast = session.index === session.list.length - 1;
    const progressPct = Math.round(((session.index + 1) / session.list.length) * 100);
    const inputType = q.type === "multiple" ? "checkbox" : "radio";
    const nextLabel = isLast ? (session.submitted ? "查看总结" : "完成练习") : "下一题";
    box.innerHTML = `
      <div class="question-meta">
        <span class="pill red">${escapeHTML(q.typeLabel)}</span>
        <span class="pill">${escapeHTML(q.unitTitle)}</span>
        <span class="pill">原题号：${q.number}</span>
        <span class="pill">做题：${hist.attempts || 0} 次</span>
        ${isWrong ? `<span class="pill red">错题本</span>` : ""}
      </div>
      <div class="progress-line">
        <span>${session.index + 1} / ${session.list.length}</span>
        <div class="bar"><span style="width:${progressPct}%"></span></div>
        <span>得分 ${session.score}</span>
      </div>
      <h2 class="question-title">${escapeHTML(q.stem)}</h2>
      <p class="quick-hint">提示：双击选项可快速作答并进入下一题。</p>
      <div class="options">
        ${q.options.map(opt => optionHTML(q, opt, inputType)).join("")}
      </div>
      <div id="resultBox"></div>
      <div class="action-row">
        <div class="left">
          <button class="secondary" id="submitAnswer">提交答案</button>
          <button class="ghost" id="showAnswer">显示答案</button>
          <button class="ghost" id="toggleStar">${isStarred ? "取消收藏" : "收藏本题"}</button>
          ${isWrong ? `<button class="ghost" id="removeWrong">移出错题</button>` : ""}
        </div>
        <div class="right">
          <button class="ghost" id="prevQuestion" ${session.index === 0 ? "disabled" : ""}>上一题</button>
          <button class="primary" id="nextQuestion">${nextLabel}</button>
        </div>
      </div>
    `;

    $$("input[name='answer']", box).forEach(input => {
      input.addEventListener("change", () => {
        const checked = $$("input[name='answer']:checked", box).map(i => i.value);
        session.selected = checked;
        renderSelectedOptions(box);
      });
    });
    $$(".option", box).forEach(label => {
      label.addEventListener("dblclick", e => {
        e.preventDefault();
        quickPickAndNext(label.dataset.key);
      });
    });
    $("#submitAnswer").addEventListener("click", () => submitAnswer());
    $("#showAnswer").addEventListener("click", () => revealAnswer(null));
    $("#toggleStar").addEventListener("click", () => toggleStar(q.id));
    $("#prevQuestion").addEventListener("click", () => moveQuestion(-1));
    $("#nextQuestion").addEventListener("click", handleNextQuestion);
    const removeWrong = $("#removeWrong");
    if (removeWrong) removeWrong.addEventListener("click", () => { removeFromWrong(q.id); renderQuestion(); });
  }

  function optionHTML(q, opt, inputType) {
    const submitted = session.submitted;
    const correct = q.answer.includes(opt.key);
    const selected = session.selected.includes(opt.key);
    let cls = "option";
    if (selected && !submitted) cls += " selected";
    if (submitted && correct) cls += " correct";
    if (submitted && selected && !correct) cls += " wrong";
    return `<label class="${cls}" data-key="${escapeHTML(opt.key)}">
      <input type="${inputType}" name="answer" value="${escapeHTML(opt.key)}" ${selected ? "checked" : ""} ${submitted ? "disabled" : ""}>
      <span><span class="option-key">${escapeHTML(opt.key)}.</span> ${escapeHTML(opt.text)}</span>
    </label>`;
  }

  function renderSelectedOptions(root) {
    $$(".option", root).forEach(label => {
      label.classList.toggle("selected", session.selected.includes(label.dataset.key) && !session.submitted);
    });
  }

  function submitAnswer(options = {}) {
    if (!session.selected.length) {
      $("#resultBox").innerHTML = `<div class="result-box bad">请先选择答案。</div>`;
      feedback(false, false);
      return false;
    }
    const q = session.list[session.index];
    const selectedSnapshot = session.selected.slice().sort();
    const correct = isSameAnswer(selectedSnapshot, q.answer);
    if (!session.submitted) {
      session.answered += 1;
      if (correct) session.score += 1;
      session.answerLog.push({ id: q.id, correct, selected: selectedSnapshot.join("") });
      const hist = store.history[q.id] || { attempts: 0, correct: 0 };
      hist.attempts += 1;
      hist.correct += correct ? 1 : 0;
      hist.lastAt = new Date().toISOString();
      hist.lastCorrect = correct;
      store.history[q.id] = hist;
      if (!correct && !store.wrong.includes(q.id)) store.wrong.push(q.id);
      if (correct && session.mode === "review") store.wrong = store.wrong.filter(id => id !== q.id);
      saveStore();
    }
    session.submitted = true;
    renderQuestion();
    revealAnswer(correct);
    feedback(correct, true);
    if (options.autoAdvance) {
      window.setTimeout(() => {
        if (session.submitted && !session.completed) handleNextQuestion();
      }, correct ? 520 : 780);
    }
    return true;
  }

  function quickPickAndNext(key) {
    if (session.submitted) {
      handleNextQuestion();
      return;
    }
    const q = session.list[session.index];
    if (q.type === "multiple") {
      if (!session.selected.includes(key)) session.selected.push(key);
    } else {
      session.selected = [key];
    }
    submitAnswer({ autoAdvance: true });
  }

  function revealAnswer(correctFlag) {
    const resultBox = $("#resultBox");
    if (!resultBox) return;
    const q = session.list[session.index];
    const selected = session.selected.length ? formatAnswer(session.selected.slice().sort().join("")) : "未作答";
    const hasSelected = session.selected.length > 0;
    const correct = correctFlag === null ? (hasSelected ? isSameAnswer(session.selected, q.answer) : false) : correctFlag;
    const cls = correct ? "ok" : "bad";
    const title = correct ? "回答正确" : (hasSelected ? "回答错误" : "参考答案");
    resultBox.innerHTML = `<div class="result-box ${cls}">
      <strong>${title}</strong><br>
      你的答案：${escapeHTML(selected)}<br>
      正确答案：${escapeHTML(formatAnswer(q.answer))}<br>
      ${escapeHTML(answerText(q))}
    </div>`;
  }

  function handleNextQuestion() {
    if (!session.list.length) return;
    const isLast = session.index === session.list.length - 1;
    if (isLast) {
      if (!session.submitted) {
        const submitted = submitAnswer();
        if (!submitted) return;
      }
      renderSessionSummary();
      return;
    }
    moveQuestion(1);
  }

  function moveQuestion(step) {
    if (!session.list.length) return;
    const next = session.index + step;
    if (next < 0 || next >= session.list.length) return;
    session.index = next;
    session.submitted = false;
    session.selected = [];
    renderQuestion();
  }

  function motivationalLine(rate, wrongCount) {
    if (rate >= 95) return "几乎满分，保持这股稳定感，考场上也会很从容！";
    if (rate >= 85) return "很棒，基础已经很稳；把错题再过一遍，就能继续提分。";
    if (rate >= 70) return "进步就在复盘里，抓住本次错题，下次正确率会明显上升。";
    if (wrongCount) return "别急，每一道错题都是提分线索；现在复练一遍，记忆会更牢。";
    return "已经完成一次练习，继续保持节奏，越练越稳！";
  }

  function renderSessionSummary() {
    session.completed = true;
    const box = $("#questionBox");
    const total = session.list.length;
    const answered = session.answerLog.length;
    const score = session.score;
    const rate = total ? Math.round((score / total) * 100) : 0;
    const wrongLogs = session.answerLog.filter(item => !item.correct);
    const wrongQuestions = wrongLogs.map(item => ({ log: item, question: getQuestion(item.id) })).filter(item => item.question);
    box.className = "question-summary";
    box.innerHTML = `
      <div class="summary-hero">
        <p class="eyebrow">Practice Report</p>
        <h2>本次练习完成</h2>
        <p>${escapeHTML(motivationalLine(rate, wrongQuestions.length))}</p>
      </div>
      <div class="summary-stats">
        <div><strong>${score}</strong><span>答对题数</span></div>
        <div><strong>${total}</strong><span>练习题数</span></div>
        <div><strong>${rate}%</strong><span>正确率</span></div>
        <div><strong>${wrongQuestions.length}</strong><span>本次错题</span></div>
      </div>
      ${answered < total ? `<p class="muted">你本次有 ${total - answered} 题未提交，正确率按本次练习总题数计算。</p>` : ""}
      <div class="review-panel">
        <div class="section-head">
          <h3>本次错题总结</h3>
          <span class="pill red">可立即复练</span>
        </div>
        ${wrongQuestions.length ? wrongQuestions.map(wrongSummaryHTML).join("") : `<div class="empty-msg success-msg">本次没有错题，状态非常好！</div>`}
      </div>
      <div class="action-row summary-actions">
        <div class="left">
          <button class="primary" id="reviewWrongNow" ${wrongQuestions.length ? "" : "disabled"}>练习本次错题</button>
          <button class="secondary" id="newPractice">再做一组</button>
        </div>
        <div class="right">
          <button class="ghost" id="skipReview">跳过复习错题</button>
        </div>
      </div>
    `;
    $("#reviewWrongNow").addEventListener("click", () => {
      if (!wrongQuestions.length) return;
      startPractice(false, wrongQuestions.map(item => item.question), "review");
    });
    $("#newPractice").addEventListener("click", () => {
      session = createEmptySession();
      $("#questionBox").className = "question-empty";
      $("#questionBox").innerHTML = `<h2>准备好下一组了吗？</h2><p class="muted">调整左侧条件后点击“生成练习”。</p>`;
      syncCountDefault(true);
    });
    $("#skipReview").addEventListener("click", () => setView("home"));
  }

  function wrongSummaryHTML(item) {
    const q = item.question;
    const selected = item.log.selected ? formatAnswer(item.log.selected) : "未作答";
    return `<article class="wrong-summary-item">
      <div class="question-meta">
        <span class="pill red">${escapeHTML(q.typeLabel)}</span>
        <span class="pill">${escapeHTML(q.unitTitle)}</span>
        <span class="pill">原题号：${q.number}</span>
      </div>
      <h4>${escapeHTML(q.stem)}</h4>
      <p><strong>你的答案：</strong>${escapeHTML(selected)}　<strong>正确答案：</strong>${escapeHTML(formatAnswer(q.answer))}</p>
      <p class="muted">${escapeHTML(answerText(q))}</p>
    </article>`;
  }

  function toggleStar(id) {
    if (store.starred.includes(id)) store.starred = store.starred.filter(x => x !== id);
    else store.starred.push(id);
    saveStore();
    renderQuestion();
  }

  function removeFromWrong(id) {
    store.wrong = store.wrong.filter(x => x !== id);
    saveStore();
  }

  function questionDetails(q, open = false) {
    const hist = historyOf(q.id);
    return `<details class="bank-item" ${open ? "open" : ""}>
      <summary>${escapeHTML(q.stem)}</summary>
      <div class="bank-content">
        <div class="question-meta">
          <span class="pill red">${escapeHTML(q.typeLabel)}</span>
          <span class="pill">${escapeHTML(q.unitTitle)}</span>
          <span class="pill">原题号：${q.number}</span>
          <span class="pill">已做 ${hist.attempts || 0} 次</span>
        </div>
        <ul class="bank-options">
          ${q.options.map(o => `<li><strong>${escapeHTML(o.key)}.</strong> ${escapeHTML(o.text)}</li>`).join("")}
        </ul>
        <p><strong>答案：</strong>${escapeHTML(formatAnswer(q.answer))}　${escapeHTML(answerText(q))}</p>
        <div class="action-row"><div class="left">
          <button class="ghost small-jump" data-id="${escapeHTML(q.id)}">练这一题</button>
          <button class="ghost small-star" data-id="${escapeHTML(q.id)}">${store.starred.includes(q.id) ? "取消收藏" : "收藏"}</button>
          ${store.wrong.includes(q.id) ? `<button class="ghost small-unwrong" data-id="${escapeHTML(q.id)}">移出错题</button>` : ""}
        </div></div>
      </div>
    </details>`;
  }

  function bindBankButtons(root = document) {
    $$(".small-jump", root).forEach(btn => btn.addEventListener("click", () => {
      const q = getQuestion(btn.dataset.id);
      session = createEmptySession([q]);
      setView("practice");
      renderQuestion();
    }));
    $$(".small-star", root).forEach(btn => btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (store.starred.includes(id)) store.starred = store.starred.filter(x => x !== id);
      else store.starred.push(id);
      saveStore();
      renderBankList();
      renderSavedLists();
    }));
    $$(".small-unwrong", root).forEach(btn => btn.addEventListener("click", () => {
      removeFromWrong(btn.dataset.id);
      renderBankList();
      renderSavedLists();
    }));
  }

  function renderBankList() {
    const kw = ($("#searchInput").value || "").trim().toLowerCase();
    const unit = $("#bankUnitFilter").value;
    const type = $("#bankTypeFilter").value;
    let list = questions.slice();
    if (unit !== "all") list = list.filter(q => q.unitId === unit);
    if (type !== "all") list = list.filter(q => q.type === type);
    if (kw) list = list.filter(q => [q.stem, q.unitTitle, q.answer, ...q.options.map(o => o.text)].join(" ").toLowerCase().includes(kw));
    const limit = 120;
    $("#bankList").innerHTML = list.length
      ? `<p class="muted">找到 ${list.length} 题${list.length > limit ? `，先显示前 ${limit} 题，请继续缩小关键词。` : "。"}</p>` + list.slice(0, limit).map(q => questionDetails(q)).join("")
      : `<div class="empty-msg">没有找到匹配题目。</div>`;
    bindBankButtons($("#bankList"));
  }

  function renderSavedLists() {
    const wrongQs = store.wrong.map(getQuestion).filter(Boolean);
    const starredQs = store.starred.map(getQuestion).filter(Boolean);
    $("#wrongList").innerHTML = wrongQs.length ? wrongQs.map(q => questionDetails(q)).join("") : `<div class="empty-msg">暂无错题。</div>`;
    $("#starredList").innerHTML = starredQs.length ? starredQs.map(q => questionDetails(q)).join("") : `<div class="empty-msg">暂无收藏。</div>`;
    bindBankButtons($("#wrongList"));
    bindBankButtons($("#starredList"));
  }

  function effectsEnabled() { return store.preferences.effectsEnabled !== false; }

  function feedback(correct, visual = true) {
    if (!effectsEnabled()) return;
    if (correct && visual) confetti();
    if (!correct) {
      const card = $(".question-card");
      if (card) {
        card.classList.remove("shake");
        void card.offsetWidth;
        card.classList.add("shake");
        window.setTimeout(() => card.classList.remove("shake"), 430);
      }
      if (navigator.vibrate) navigator.vibrate([70, 35, 70]);
    }
  }

  function confetti() {
    const wrap = document.createElement("div");
    wrap.className = "confetti-wrap";
    const colors = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];
    for (let i = 0; i < 42; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.setProperty("--x", `${(Math.random() - 0.5) * 220}px`);
      piece.style.setProperty("--r", `${Math.random() * 720 - 360}deg`);
      piece.style.animationDelay = `${Math.random() * 0.08}s`;
      wrap.appendChild(piece);
    }
    document.body.appendChild(wrap);
    window.setTimeout(() => wrap.remove(), 1200);
  }

  function bindEvents() {
    $$(".tab").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));
    $("#quickStart").addEventListener("click", () => startPractice(true));
    $("#goPractice").addEventListener("click", () => { syncCountDefault(true); setView("practice"); });
    $("#startPractice").addEventListener("click", () => startPractice(false));
    ["unitFilter", "typeFilter", "poolFilter"].forEach(id => $("#" + id).addEventListener("change", () => syncCountDefault(true)));
    $("#orderFilter").addEventListener("change", () => syncCountDefault(false));
    $("#effectsToggle").addEventListener("change", e => {
      store.preferences.effectsEnabled = e.target.checked;
      saveStore();
    });
    $("#searchInput").addEventListener("input", renderBankList);
    $("#bankUnitFilter").addEventListener("change", renderBankList);
    $("#bankTypeFilter").addEventListener("change", renderBankList);
    $("#resetProgress").addEventListener("click", () => {
      if (confirm("确定清空本机练习记录、错题和收藏吗？")) {
        store = { ...defaultStore, preferences: { ...defaultStore.preferences } };
        saveStore();
        syncCountDefault(true);
      }
    });
    $("#clearWrong").addEventListener("click", () => { store.wrong = []; saveStore(); renderSavedLists(); syncCountDefault(true); });
    $("#clearStarred").addEventListener("click", () => { store.starred = []; saveStore(); renderSavedLists(); syncCountDefault(true); });
    document.addEventListener("keydown", e => {
      if (!$("#view-practice").classList.contains("active") || !session.list.length || session.completed) return;
      if (["A", "B", "C", "D"].includes(e.key.toUpperCase())) {
        const input = $(`input[name='answer'][value='${e.key.toUpperCase()}']`);
        if (input && !input.disabled) input.click();
      }
      if (e.key === "Enter") {
        if (!session.submitted) submitAnswer();
        else handleNextQuestion();
      }
    });
  }

  function init() {
    initFilters();
    renderDashboard();
    renderPracticeMiniStats();
    renderSavedLists();
    bindEvents();
    syncCountDefault(true);
    const initial = location.hash.replace("#", "");
    if (["home", "practice", "bank", "saved"].includes(initial)) setView(initial);
  }

  init();
})();
