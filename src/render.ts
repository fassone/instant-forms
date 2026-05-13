import type { ChoiceQuestion, FormQuestion, InstantForm, TextQuestion } from "./forms";

type ClientQuestion =
  | {
      kind: "choice";
      key: string;
      options: readonly string[];
    }
  | {
      kind: "text";
      key: string;
      type: TextQuestion["type"];
    };

type ClientFormConfig = {
  stateCode: string;
  questions: readonly ClientQuestion[];
};

export function renderFormPage(form: InstantForm): string {
  const clientConfig: ClientFormConfig = {
    stateCode: form.stateCode,
    questions: form.questions.map((question) => {
      if (question.kind === "choice") {
        return {
          kind: "choice",
          key: question.key,
          options: question.options.map((option) => option.key),
        };
      }

      return {
        kind: "text",
        key: question.key,
        type: question.type,
      };
    }),
  };

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(form.page.name)} | ${escapeHtml(form.stateCode.toUpperCase())}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f7f6;
        --surface: #ffffff;
        --text: #15211e;
        --muted: #5d6b66;
        --border: #d9e3df;
        --primary: #0f766e;
        --primary-dark: #115e59;
        --accent: #d97706;
        --danger: #b42318;
        --shadow: 0 20px 60px rgba(21, 33, 30, 0.12);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        min-height: 100vh;
        margin: 0;
        background:
          linear-gradient(135deg, rgba(15, 118, 110, 0.08), rgba(217, 119, 6, 0.08)),
          var(--bg);
        color: var(--text);
      }

      button,
      input {
        font: inherit;
      }

      .shell {
        display: grid;
        min-height: 100vh;
        place-items: center;
        padding: 24px;
      }

      .form-panel {
        width: min(100%, 720px);
        min-height: min(680px, calc(100vh - 48px));
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        gap: 28px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: var(--shadow);
        padding: clamp(24px, 5vw, 56px);
      }

      .brand {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .brand-name {
        margin: 0;
        font-size: 1rem;
        font-weight: 800;
        letter-spacing: 0;
      }

      .state-pill {
        border: 1px solid var(--border);
        border-radius: 999px;
        color: var(--muted);
        font-size: 0.85rem;
        font-weight: 700;
        padding: 6px 12px;
        text-transform: uppercase;
      }

      .progress-shell {
        height: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: #e6eeeb;
      }

      .progress-bar {
        width: 12.5%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--primary), var(--accent));
        transition: width 180ms ease;
      }

      .step {
        display: none;
        align-self: center;
      }

      .step[aria-hidden="false"] {
        display: block;
      }

      .step-count {
        margin: 0 0 12px;
        color: var(--muted);
        font-size: 0.95rem;
        font-weight: 700;
      }

      .question-title {
        max-width: 18ch;
        margin: 0 0 28px;
        font-size: clamp(2rem, 6vw, 4.1rem);
        line-height: 1.02;
        letter-spacing: 0;
      }

      .options {
        display: grid;
        gap: 12px;
      }

      .option {
        display: flex;
        min-height: 64px;
        align-items: center;
        gap: 14px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: #fbfdfc;
        cursor: pointer;
        padding: 16px 18px;
        transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
      }

      .option:hover,
      .option:has(input:focus-visible) {
        border-color: var(--primary);
        box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.13);
        transform: translateY(-1px);
      }

      .option:has(input:checked) {
        border-color: var(--primary);
        background: #ecfdf5;
      }

      .option input {
        width: 20px;
        height: 20px;
        accent-color: var(--primary);
      }

      .option-index {
        display: inline-grid;
        width: 28px;
        height: 28px;
        place-items: center;
        border: 1px solid var(--border);
        border-radius: 6px;
        color: var(--muted);
        font-size: 0.85rem;
        font-weight: 800;
      }

      .option-text {
        font-size: 1.15rem;
        font-weight: 800;
      }

      .text-input {
        width: 100%;
        min-height: 68px;
        border: 0;
        border-bottom: 3px solid var(--border);
        border-radius: 0;
        background: transparent;
        color: var(--text);
        font-size: clamp(1.5rem, 5vw, 3rem);
        font-weight: 800;
        outline: 0;
        padding: 6px 0 14px;
      }

      .text-input:focus {
        border-color: var(--primary);
      }

      .error {
        min-height: 24px;
        margin: 0;
        color: var(--danger);
        font-size: 0.95rem;
        font-weight: 700;
      }

      .actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .button {
        min-height: 48px;
        border: 1px solid transparent;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 800;
        padding: 0 20px;
      }

      .button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }

      .button-secondary {
        border-color: var(--border);
        background: #ffffff;
        color: var(--text);
      }

      .button-primary {
        background: var(--primary);
        color: #ffffff;
      }

      .button-primary:hover {
        background: var(--primary-dark);
      }

      .thanks,
      .unavailable {
        width: min(100%, 720px);
        border: 1px solid var(--border);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: var(--shadow);
        padding: clamp(28px, 6vw, 64px);
      }

      .thanks[hidden] {
        display: none;
      }

      .thanks h1,
      .unavailable h1 {
        margin: 0 0 16px;
        font-size: clamp(2.2rem, 8vw, 4.5rem);
        line-height: 1;
        letter-spacing: 0;
      }

      .thanks p,
      .unavailable p {
        margin: 0;
        color: var(--muted);
        font-size: 1.1rem;
        line-height: 1.6;
      }

      @media (max-width: 560px) {
        .shell {
          align-items: stretch;
          padding: 0;
        }

        .form-panel,
        .thanks,
        .unavailable {
          min-height: 100vh;
          width: 100%;
          border: 0;
          border-radius: 0;
          box-shadow: none;
        }

        .brand {
          align-items: flex-start;
        }

        .question-title {
          max-width: 100%;
        }

        .actions {
          align-items: stretch;
        }

        .button {
          flex: 1;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <form class="form-panel" id="lead-form" novalidate>
        <header class="brand">
          <p class="brand-name">${escapeHtml(form.page.name)}</p>
          <span class="state-pill">${escapeHtml(form.stateCode)}</span>
        </header>
        <div class="progress-shell" aria-hidden="true">
          <div class="progress-bar" id="progress-bar"></div>
        </div>
        <section id="steps">
          ${form.questions.map((question, index) => renderQuestion(question, index, form.questions.length)).join("")}
        </section>
        <footer>
          <p class="error" id="form-error" role="alert"></p>
          <div class="actions">
            <button class="button button-secondary" id="back-button" type="button">Atrás</button>
            <button class="button button-primary" id="next-button" type="button">Siguiente</button>
          </div>
        </footer>
      </form>
      <section class="thanks" id="thanks" tabindex="-1" hidden>
        <h1>Gracias.</h1>
        <p>Recibimos su información. Un agente se pondrá en contacto con usted pronto.</p>
      </section>
    </main>
    <script>
      window.__FORM_CONFIG__ = ${serializeForScript(clientConfig)};
    </script>
    <script>
      (() => {
        const config = window.__FORM_CONFIG__;
        const form = document.getElementById("lead-form");
        const thanks = document.getElementById("thanks");
        const steps = Array.from(document.querySelectorAll("[data-step]"));
        const progressBar = document.getElementById("progress-bar");
        const backButton = document.getElementById("back-button");
        const nextButton = document.getElementById("next-button");
        const error = document.getElementById("form-error");
        const answers = {};
        let currentStep = 0;
        let isSubmitting = false;

        function showStep(nextStep) {
          currentStep = Math.max(0, Math.min(nextStep, steps.length - 1));

          steps.forEach((step, index) => {
            step.setAttribute("aria-hidden", String(index !== currentStep));
          });

          progressBar.style.width = ((currentStep + 1) / steps.length) * 100 + "%";
          backButton.disabled = currentStep === 0 || isSubmitting;
          nextButton.textContent = currentStep === steps.length - 1 ? "Enviar" : "Siguiente";
          nextButton.disabled = isSubmitting;
          error.textContent = "";

          const field = steps[currentStep].querySelector("input");
          if (field) {
            window.setTimeout(() => field.focus(), 0);
          }
        }

        function getQuestion() {
          return config.questions[currentStep];
        }

        function getCurrentAnswer() {
          const question = getQuestion();

          if (question.kind === "choice") {
            const checked = steps[currentStep].querySelector("input[type='radio']:checked");
            return checked ? checked.value : "";
          }

          const input = steps[currentStep].querySelector("input");
          return input ? input.value.trim() : "";
        }

        function validateCurrentStep() {
          const question = getQuestion();
          const answer = getCurrentAnswer();

          if (!answer) {
            error.textContent = "Esta respuesta es requerida.";
            return false;
          }

          if (question.type === "PHONE" && answer.replace(/\\D/g, "").length !== 10) {
            error.textContent = "Ingrese un número de teléfono de 10 dígitos.";
            return false;
          }

          answers[question.key] = question.type === "PHONE" ? answer.replace(/\\D/g, "") : answer;
          error.textContent = "";
          return true;
        }

        async function submitForm() {
          isSubmitting = true;
          showStep(currentStep);

          try {
            const response = await fetch("/api/forms/" + encodeURIComponent(config.stateCode) + "/submissions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ answers }),
            });

            if (!response.ok) {
              const body = await response.json().catch(() => ({}));
              const firstError = Array.isArray(body.errors) ? body.errors[0] : undefined;
              throw new Error(firstError && firstError.message ? firstError.message : "No pudimos enviar el formulario.");
            }

            form.hidden = true;
            thanks.hidden = false;
            thanks.focus();
          } catch (submitError) {
            error.textContent = submitError instanceof Error ? submitError.message : "No pudimos enviar el formulario.";
          } finally {
            isSubmitting = false;
            showStep(currentStep);
          }
        }

        nextButton.addEventListener("click", () => {
          if (!validateCurrentStep()) {
            return;
          }

          if (currentStep === steps.length - 1) {
            void submitForm();
            return;
          }

          showStep(currentStep + 1);
        });

        backButton.addEventListener("click", () => {
          showStep(currentStep - 1);
        });

        form.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            nextButton.click();
            return;
          }

          const question = getQuestion();
          if (question.kind !== "choice" || !/^[1-9]$/.test(event.key)) {
            return;
          }

          const optionIndex = Number(event.key) - 1;
          const optionKey = question.options[optionIndex];
          if (!optionKey) {
            return;
          }

          const option = Array.from(steps[currentStep].querySelectorAll("input[type='radio']")).find(
            (input) => input.value === optionKey,
          );
          if (option) {
            option.checked = true;
            answers[question.key] = option.value;
            error.textContent = "";
          }
        });

        showStep(0);
      })();
    </script>
  </body>
</html>`;
}

export function renderUnavailablePage(stateCode: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Formulario no disponible</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f7f6;
        --surface: #ffffff;
        --text: #15211e;
        --muted: #5d6b66;
        --border: #d9e3df;
        --primary: #0f766e;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: var(--bg);
        color: var(--text);
        padding: 24px;
      }

      .unavailable {
        width: min(100%, 680px);
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        padding: clamp(28px, 6vw, 64px);
      }

      h1 {
        margin: 0 0 16px;
        font-size: clamp(2.2rem, 8vw, 4.5rem);
        line-height: 1;
        letter-spacing: 0;
      }

      p {
        margin: 0;
        color: var(--muted);
        font-size: 1.1rem;
        line-height: 1.6;
      }

      a {
        color: var(--primary);
        font-weight: 800;
      }
    </style>
  </head>
  <body>
    <main class="unavailable">
      <h1>No disponible.</h1>
      <p>El formulario para ${escapeHtml(stateCode.toUpperCase())} no está disponible en este momento. Puede volver al <a href="/tn">formulario de Tennessee</a>.</p>
    </main>
  </body>
</html>`;
}

function renderQuestion(question: FormQuestion, index: number, totalQuestions: number): string {
  const isCurrent = index === 0;

  return `<article class="step" data-step="${index}" aria-hidden="${String(!isCurrent)}">
    <p class="step-count">Paso ${index + 1} de ${totalQuestions}</p>
    <h1 class="question-title">${escapeHtml(question.label)}</h1>
    ${question.kind === "choice" ? renderOptions(question) : renderTextInput(question)}
  </article>`;
}

function renderOptions(question: ChoiceQuestion): string {
  return `<div class="options">
    ${question.options
      .map(
        (option, index) => `<label class="option">
          <input type="radio" name="${escapeHtml(question.key)}" value="${escapeHtml(option.key)}">
          <span class="option-index">${index + 1}</span>
          <span class="option-text">${escapeHtml(option.value)}</span>
        </label>`,
      )
      .join("")}
  </div>`;
}

function renderTextInput(question: TextQuestion): string {
  const inputType = question.type === "PHONE" ? "tel" : "text";

  return `<input
    class="text-input"
    type="${inputType}"
    name="${escapeHtml(question.key)}"
    autocomplete="${escapeHtml(question.autocomplete)}"
    inputmode="${escapeHtml(question.inputMode)}"
  >`;
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&]/g, (character) => {
    if (character === "<") {
      return "\\u003c";
    }

    if (character === ">") {
      return "\\u003e";
    }

    return "\\u0026";
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
