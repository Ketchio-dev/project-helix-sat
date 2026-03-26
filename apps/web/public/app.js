const state = {
  userId: 'demo-student',
  currentItem: null,
  currentSessionId: null,
};

const $ = (selector) => document.querySelector(selector);
const json = async (url, options) => {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Demo-User-Id': state.userId,
    },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
};

function renderProfile(profile) {
  $('#profile').innerHTML = `
    <div class="kv">
      <strong>Name</strong><span>${profile.name}</span>
      <strong>Target score</strong><span>${profile.targetScore}</span>
      <strong>Test date</strong><span>${profile.targetTestDate}</span>
      <strong>Daily minutes</strong><span>${profile.dailyMinutes}</span>
      <strong>Language</strong><span>${profile.preferredExplanationLanguage}</span>
    </div>
  `;
}

function renderProjection(projection) {
  $('#projection').innerHTML = `
    <div class="kv">
      <strong>Total</strong><span>${projection.predicted_total_low} - ${projection.predicted_total_high}</span>
      <strong>Reading & Writing</strong><span>${projection.rw_low} - ${projection.rw_high}</span>
      <strong>Math</strong><span>${projection.math_low} - ${projection.math_high}</span>
      <strong>Readiness</strong><span>${projection.readiness_indicator}</span>
      <strong>Confidence</strong><span>${Math.round(projection.confidence * 100)}%</span>
      <strong>Momentum</strong><span>${Math.round((projection.momentum_score ?? 0) * 100)}%</span>
    </div>
  `;
}

function renderPlan(plan) {
  const blocks = plan.blocks.map((block) => `
    <li>
      <strong>${block.block_type}</strong> — ${block.minutes} min<br />
      ${block.objective}<br />
      <span class="muted">Expected benefit: ${block.expected_benefit}</span>
    </li>
  `).join('');

  $('#plan').innerHTML = `
    <p>${plan.rationale_summary ?? 'Adaptive plan generated from learner state.'}</p>
    <ul class="list">${blocks}</ul>
    <p class="muted">Fallback: ${plan.fallback_plan.trigger}</p>
    <p class="muted">Stop condition: ${plan.stop_condition}</p>
  `;
}

function renderErrorDna(errorDna) {
  const tags = Object.entries(errorDna)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag, score]) => `<span class="badge">${tag}: ${score}</span>`)
    .join('');
  $('#errorDna').innerHTML = tags || '<p class="muted">No dominant error signals yet.</p>';
}

function renderItem(item) {
  state.currentItem = item;
  if (!item) {
    $('#itemArea').innerHTML = '<p class="muted">Start a diagnostic to load a practice item.</p>';
    $('#attemptForm').classList.add('hidden');
    return;
  }

  const choices = item.choices.map((choice) => `
    <label class="choice">
      <input type="radio" name="selectedAnswer" value="${choice.key}" />
      <span><strong>${choice.key}.</strong> ${choice.text}</span>
    </label>
  `).join('');

  $('#itemArea').innerHTML = `
    <p class="muted">${item.section} / ${item.domain} / ${item.skill}</p>
    <h3>${item.prompt}</h3>
    ${item.passage ? `<p>${item.passage}</p>` : ''}
    <div class="choice-list">${choices}</div>
  `;
  $('#attemptForm').classList.remove('hidden');
}

function renderSessionProgress(progress) {
  if (!progress) return;
  if (progress.isComplete) {
    $('#diagnosticStatus').textContent = `Diagnostic complete: ${progress.answered}/${progress.total} items answered.`;
    $('#attemptForm').classList.add('hidden');
    return;
  }
  $('#diagnosticStatus').textContent = `Diagnostic progress: ${progress.answered}/${progress.total} answered.`;
}

async function loadDashboard() {
  try {
    const dashboard = await json('/api/dashboard/learner');

    renderProfile(dashboard.profile);
    renderProjection(dashboard.projection);
    renderPlan(dashboard.plan);
    renderErrorDna(dashboard.errorDna);
    if (!state.currentItem) renderItem(dashboard.items[0]);
    $('#diagnosticStatus').textContent = dashboard.profile.lastSessionSummary || 'No active diagnostic session.';
  } catch (error) {
    $('#diagnosticStatus').textContent = error.message;
  }
}

$('#refreshDashboard').addEventListener('click', loadDashboard);

$('#startDiagnostic').addEventListener('click', async () => {
  try {
    const result = await json('/api/diagnostic/start', {
      method: 'POST',
      body: JSON.stringify({ userId: state.userId }),
    });
    state.currentSessionId = result.session.id;
    renderItem(result.currentItem);
    renderSessionProgress(result.sessionProgress);
  } catch (error) {
    $('#diagnosticStatus').textContent = error.message;
  }
});

$('#attemptForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const selected = document.querySelector('input[name="selectedAnswer"]:checked');
  if (!selected || !state.currentItem) {
    $('#attemptResult').textContent = 'Select an answer first.';
    return;
  }

  const payload = {
    userId: state.userId,
    itemId: state.currentItem.itemId,
    sessionId: state.currentSessionId,
    selectedAnswer: selected.value,
    confidenceLevel: Number($('#confidenceLevel').value),
    mode: $('#modeSelect').value,
    responseTimeMs: 48000,
  };

  try {
    const result = await json('/api/attempt/submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    $('#attemptResult').textContent = JSON.stringify(result, null, 2);
    renderProjection(result.projection);
    renderPlan(result.plan);
    renderErrorDna(result.errorDna);
    renderSessionProgress(result.sessionProgress);
    if (result.nextItem) {
      renderItem(result.nextItem);
      document.querySelectorAll('input[name="selectedAnswer"]').forEach((input) => {
        input.checked = false;
      });
    } else {
      renderItem(null);
    }
  } catch (error) {
    $('#attemptResult').textContent = error.message;
  }
});

$('#getHint').addEventListener('click', async () => {
  if (!state.currentItem) return;
  try {
    const result = await json('/api/tutor/hint', {
      method: 'POST',
      body: JSON.stringify({
        userId: state.userId,
        itemId: state.currentItem.itemId,
        mode: $('#modeSelect').value,
        requestedLevel: 1,
      }),
    });
    $('#hintResult').textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    $('#hintResult').textContent = error.message;
  }
});

loadDashboard();
