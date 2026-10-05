export function renderFormStyles(): string {
  return `
    <style>
      :root {
        color-scheme: light;
        --brand-navy: #073b8e;
        --brand-blue: #064df6;
        --brand-pink: #f80057;
        --brand-cream: #fff7df;
        --bg: #073b8e;
        --surface: #fffdf4;
        --text: #111427;
        --muted: #4d5878;
        --border: #d9dff0;
        --primary: var(--brand-blue);
        --primary-dark: #0437b3;
        --accent: var(--brand-pink);
        --danger: #b42318;
        --shadow: 0 24px 70px rgba(1, 28, 76, 0.22);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        min-height: 100vh;
        margin: 0;
        background:
          linear-gradient(145deg, rgba(6, 77, 246, 0.24), rgba(248, 0, 87, 0.08)),
          var(--bg);
        color: var(--text);
      }

      a,
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
        background: rgba(255, 253, 244, 0.98);
        box-shadow: var(--shadow);
        padding: clamp(24px, 5vw, 56px);
      }

      .brand {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .form-panel[data-form-chrome="hidden"] {
        grid-template-rows: minmax(0, 1fr) auto;
      }

      .form-panel[data-form-chrome="hidden"] .brand,
      .form-panel[data-form-chrome="hidden"] .progress-area {
        display: none;
      }

      .form-panel[data-form-view="post-submit"] {
        grid-template-rows: auto auto minmax(0, 1fr);
      }

      .form-panel[data-form-view="post-submit"][data-has-footer="true"] {
        grid-template-rows: auto auto minmax(0, 1fr) auto;
      }

      .brand-identity {
        min-width: 0;
      }

      .brand-logo {
        display: block;
        aspect-ratio: 236 / 73;
        width: clamp(160px, 34vw, 236px);
        height: auto;
      }

      .brand-trust {
        margin-top: 4px;
        color: var(--brand-navy);
        font-size: 0.95rem;
        font-weight: 800;
        letter-spacing: 0;
      }

      .area-pill {
        border: 1px solid rgba(6, 77, 246, 0.22);
        border-radius: 999px;
        background: rgba(6, 77, 246, 0.07);
        color: var(--brand-navy);
        font-size: 0.85rem;
        font-weight: 700;
        padding: 6px 12px;
        text-transform: uppercase;
      }

      .progress-area {
        position: relative;
      }

      .progress-meta {
        position: absolute;
        right: 0;
        bottom: calc(100% + 6px);
        display: flex;
        min-height: 1.3em;
        align-items: center;
        justify-content: flex-end;
      }

      .progress-shell {
        height: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: #e5e9f7;
      }

      .progress-bar {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--brand-blue), var(--brand-pink));
        transition: width 180ms ease;
      }

      .step {
        display: none;
        align-self: center;
      }

      .step[aria-hidden="false"] {
        display: block;
      }

      .post-submit-step {
        align-self: center;
      }

      .post-submit-message {
        margin: 0;
        color: var(--muted);
        font-size: 1.1rem;
        line-height: 1.6;
      }

      #steps {
        min-height: 0;
      }

      .form-panel[data-active-step-kind="interstitial"] #steps {
        display: grid;
      }

      .form-panel[data-active-step-kind="autocomplete"] #steps,
      .form-panel[data-active-step-kind="choice"] #steps,
      .form-panel[data-active-step-kind="trusted_form_consent"] #steps {
        display: grid;
        grid-template-rows: minmax(0, 1fr);
        height: 100%;
        min-height: 0;
        overflow: visible;
      }

      .step[data-step-kind="choice"] {
        --choice-options-gap: 12px;
        --choice-option-min-height: 64px;
        --choice-option-gap: 14px;
        --choice-option-padding-block: 16px;
        --choice-option-padding-inline: 18px;
        --choice-option-input-size: 20px;
        --choice-option-index-size: 28px;
        --choice-option-index-radius: 6px;
        --choice-option-index-font-size: 0.85rem;
        --choice-option-text-font-size: 1.15rem;
      }

      .step[data-step-kind="choice"][data-choice-size="compact"] {
        --choice-options-gap: 8px;
        --choice-option-min-height: 56px;
        --choice-option-gap: 12px;
        --choice-option-padding-block: 12px;
        --choice-option-padding-inline: 14px;
        --choice-option-input-size: 18px;
        --choice-option-index-size: 26px;
        --choice-option-text-font-size: 1.05rem;
      }

      .step[data-step-kind="choice"][data-choice-size="spacious"] {
        --choice-options-gap: 16px;
        --choice-option-min-height: 72px;
        --choice-option-gap: 16px;
        --choice-option-padding-block: 18px;
        --choice-option-padding-inline: 22px;
        --choice-option-input-size: 22px;
        --choice-option-index-size: 32px;
        --choice-option-text-font-size: 1.22rem;
      }

      .step[data-step-kind="interstitial"][aria-hidden="false"] {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        gap: 20px;
        height: 100%;
        min-height: 0;
        align-self: stretch;
      }

      .step[data-interstitial-timing="welcome"][aria-hidden="false"] {
        align-content: start;
        overflow: visible;
      }

      .step[data-interstitial-timing="welcome"] .question-title {
        margin: 0;
      }

      .step[data-step-kind="choice"][aria-hidden="false"] {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        height: 100%;
        min-height: 0;
        align-self: stretch;
        overflow: visible;
      }

      .step[data-step-kind="autocomplete"][aria-hidden="false"] {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        height: 100%;
        min-height: 0;
        align-self: stretch;
      }

      .step[data-step-kind="trusted_form_consent"][aria-hidden="false"] {
        display: grid;
        grid-template-rows: auto auto minmax(0, 1fr);
        height: 100%;
        min-height: 0;
        align-self: stretch;
        gap: 20px;
        overflow: visible;
      }

      .step[data-step-kind="trusted_form_consent"][aria-hidden="false"] .question-title {
        margin: 0;
      }

      .step-count {
        margin: 0;
        color: var(--brand-navy);
        font-size: 0.95rem;
        font-weight: 700;
        line-height: 1.3;
      }

      .step-count[aria-hidden="true"] {
        visibility: hidden;
      }

      .question-title {
        max-width: 100%;
        margin: 0 0 28px;
        font-size: clamp(2rem, 4vw, 2.75rem);
        line-height: 1.02;
        letter-spacing: 0;
        text-wrap: balance;
      }

      .question-description {
        max-width: 100%;
        margin: 0;
        color: var(--muted);
        font-size: 1.05rem;
        font-weight: 400;
        line-height: 1.45;
      }

      .question-description[hidden] {
        display: none;
      }

      .question-description p,
      .consent-copy p {
        margin: 0;
      }

      .question-description a,
      .consent-copy a {
        color: var(--brand-navy);
        font-weight: 800;
      }

      .question-description strong,
      .question-description b {
        font-weight: 800;
      }

      .matching-content {
        position: relative;
        display: grid;
        min-height: 300px;
        place-items: center;
        align-content: center;
        justify-content: center;
        gap: 16px;
        overflow: visible;
        text-align: center;
      }

      .step[data-step-kind="interstitial"] .matching-content {
        height: 100%;
        min-height: 0;
      }

      .matching-status {
        margin: 0;
        color: var(--brand-navy);
        font-size: clamp(1.2rem, 3vw, 1.65rem);
        font-weight: 800;
      }

      .matching-benefit {
        position: relative;
        z-index: 2;
        min-height: 1.4em;
        margin: 0;
        color: var(--accent);
        width: min(100%, 620px);
        justify-self: center;
        font-size: clamp(1.45rem, 4vw, 2.2rem);
        font-weight: 800;
        line-height: 1.1;
        opacity: 0;
        will-change: opacity;
      }

      .matching-benefit.is-visible {
        opacity: 1;
      }

      .matching-benefit.is-fading-in {
        animation: matching-benefit-fade-in 420ms ease forwards;
      }

      .matching-benefit.is-fading-out {
        animation: matching-benefit-fade-out 300ms ease forwards;
      }

      .matching-benefit.is-success {
        z-index: 5;
        max-width: 100%;
        font-size: clamp(1.35rem, 3vw, 1.65rem);
        line-height: 1.18;
        letter-spacing: 0;
        text-wrap: balance;
        -webkit-text-stroke: 0.025em rgba(255, 253, 244, 0.9);
        paint-order: stroke fill;
        white-space: pre-line;
        text-shadow:
          0 0.025em 0 rgba(255, 253, 244, 0.74),
          0 0.1em 0.22em rgba(7, 59, 142, 0.14);
        filter: drop-shadow(0 12px 24px rgba(7, 59, 142, 0.1));
      }

      .matching-success-line {
        display: block;
      }

      .matching-success-line[data-color="brand-navy"] {
        color: var(--brand-navy);
      }

      .matching-success-line[data-color="accent"] {
        color: var(--accent);
      }

      .matching-status:empty {
        display: none;
      }

      .welcome-content {
        display: grid;
        grid-row: 2;
        align-self: stretch;
        align-content: start;
        justify-items: stretch;
        gap: 22px;
        height: 100%;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 2px 4px 2px 0;
        -webkit-overflow-scrolling: touch;
      }

      .welcome-body {
        min-width: 0;
        margin: 0;
        color: var(--muted);
        font-size: clamp(1.08rem, 2.4vw, 1.28rem);
        font-weight: 650;
        line-height: 1.45;
        text-wrap: balance;
        overflow-wrap: anywhere;
      }

      .welcome-benefits {
        display: grid;
        gap: 12px;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .welcome-benefit {
        position: relative;
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr);
        align-items: center;
        gap: 12px;
        min-height: 56px;
        padding: 12px 14px;
        border: 1px solid rgba(7, 59, 142, 0.16);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.72);
        color: var(--text);
        font-size: clamp(1rem, 2.2vw, 1.12rem);
        font-weight: 800;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }

      .welcome-benefit::before {
        content: "";
        width: 28px;
        height: 28px;
        border-radius: 999px;
        background:
          linear-gradient(135deg, var(--brand-blue), var(--accent));
        box-shadow: 0 8px 18px rgba(7, 59, 142, 0.18);
      }

      .welcome-benefit::after {
        content: "";
        position: absolute;
        left: 23px;
        top: 50%;
        width: 7px;
        height: 12px;
        border: solid #fff;
        border-width: 0 3px 3px 0;
        transform: translateY(-58%) rotate(45deg);
      }

      .choice-options-shell {
        position: relative;
        min-height: 0;
        overflow: visible;
      }

      .step[data-step-kind="choice"][aria-hidden="false"] .choice-options-shell {
        grid-row: 2;
        align-self: stretch;
        height: 100%;
      }

      .options {
        display: grid;
        height: 100%;
        align-content: start;
        gap: var(--choice-options-gap);
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 2px 4px 2px 0;
        -webkit-overflow-scrolling: touch;
      }

      .choice-options-fade {
        position: absolute;
        right: 0;
        left: 0;
        z-index: 2;
        height: 32px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 140ms ease;
      }

      .choice-options-fade-top {
        top: 0;
        background: linear-gradient(180deg, var(--surface), rgba(255, 253, 244, 0));
      }

      .choice-options-fade-bottom {
        bottom: 0;
        background: linear-gradient(0deg, var(--surface), rgba(255, 253, 244, 0));
      }

      .choice-options-shell[data-can-scroll-up="true"] .choice-options-fade-top,
      .choice-options-shell[data-can-scroll-down="true"] .choice-options-fade-bottom {
        opacity: 1;
      }

      .scroll-more-hint {
        appearance: none;
        position: absolute;
        right: 50%;
        bottom: 0;
        z-index: 3;
        border: 1px solid rgba(6, 77, 246, 0.16);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 10px 28px rgba(7, 59, 142, 0.14);
        color: var(--brand-navy);
        cursor: pointer;
        font-family: inherit;
        font-size: 0.78rem;
        font-weight: 800;
        opacity: 0;
        padding: 5px 10px;
        pointer-events: none;
        transform: translateX(50%) translateY(calc(50% + 4px));
        transition: opacity 140ms ease, transform 140ms ease;
        white-space: nowrap;
      }

      [data-can-scroll-down="true"] > .scroll-more-hint {
        opacity: 1;
        pointer-events: auto;
        transform: translateX(50%) translateY(50%);
      }

      .option {
        display: flex;
        min-height: var(--choice-option-min-height);
        align-items: center;
        gap: var(--choice-option-gap);
        border: 1px solid var(--border);
        border-radius: 8px;
        background: #ffffff;
        cursor: pointer;
        padding: var(--choice-option-padding-block) var(--choice-option-padding-inline);
        transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
      }

      .option:hover,
      .option:has(input:focus-visible) {
        border-color: var(--primary);
        box-shadow: 0 0 0 4px rgba(6, 77, 246, 0.13);
        transform: translateY(-1px);
      }

      .option:has(input:checked) {
        border-color: var(--brand-blue);
        background: #eff4ff;
      }

      .option input {
        width: var(--choice-option-input-size);
        height: var(--choice-option-input-size);
        accent-color: var(--primary);
      }

      .option-index {
        display: inline-grid;
        width: var(--choice-option-index-size);
        height: var(--choice-option-index-size);
        place-items: center;
        border: 1px solid var(--border);
        border-radius: var(--choice-option-index-radius);
        color: var(--brand-navy);
        font-size: var(--choice-option-index-font-size);
        font-weight: 800;
      }

      .option-text {
        min-width: 0;
        font-size: var(--choice-option-text-font-size);
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
        font-weight: 400;
        outline: 0;
        padding: 6px 0 6px;
      }

      .text-input::placeholder {
        color: rgba(21, 24, 43, 0.34);
        font-weight: 400;
        opacity: 1;
      }

      .text-input:focus {
        border-color: var(--primary);
      }

      .autocomplete-field {
        min-height: 0;
        position: relative;
      }

      .step[data-step-kind="autocomplete"][aria-hidden="false"] .autocomplete-field {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
      }

      .autocomplete-suggestions-shell {
        position: relative;
        min-height: 0;
        margin-top: 12px;
        overflow: visible;
      }

      .step[data-step-kind="autocomplete"][aria-hidden="false"] .autocomplete-suggestions-shell {
        align-self: stretch;
        height: 100%;
      }

      .autocomplete-suggestions-shell[data-autocomplete-empty="true"] {
        pointer-events: none;
        visibility: hidden;
      }

      .autocomplete-suggestions {
        display: grid;
        height: 100%;
        align-content: start;
        gap: 8px;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 2px 4px 2px 0;
        -webkit-overflow-scrolling: touch;
      }

      .autocomplete-scroll-fade {
        position: absolute;
        right: 0;
        left: 0;
        z-index: 2;
        height: 32px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 140ms ease;
      }

      .autocomplete-scroll-fade-top {
        top: 0;
        background: linear-gradient(180deg, var(--surface), rgba(255, 253, 244, 0));
      }

      .autocomplete-scroll-fade-bottom {
        bottom: 0;
        background: linear-gradient(0deg, var(--surface), rgba(255, 253, 244, 0));
      }

      .autocomplete-suggestions-shell[data-can-scroll-up="true"] .autocomplete-scroll-fade-top,
      .autocomplete-suggestions-shell[data-can-scroll-down="true"] .autocomplete-scroll-fade-bottom {
        opacity: 1;
      }

      .autocomplete-suggestion {
        min-height: 48px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: #ffffff;
        color: var(--text);
        cursor: pointer;
        font-weight: 800;
        padding: 0 14px;
        text-align: left;
      }

      .autocomplete-suggestion:focus-visible,
      .autocomplete-suggestion:hover {
        border-color: var(--primary);
        box-shadow: 0 0 0 4px rgba(6, 77, 246, 0.13);
      }

      .autocomplete-suggestion-value {
        color: var(--brand-navy);
        font-size: 0.85em;
        margin-left: 6px;
      }

      .consent-card {
        display: grid;
        grid-template-rows: minmax(0, 1fr);
        width: min(100%, 620px);
        height: 100%;
        min-height: 0;
        overflow: visible;
        gap: 14px;
      }

      .trusted-form-panels {
        display: grid;
        height: 100%;
        min-height: 0;
        gap: 20px;
        overflow: visible;
      }

      .trusted-form-panel[aria-hidden="true"] {
        display: none;
      }

      .trusted-form-review {
        display: grid;
        grid-template-rows: minmax(0, 1fr);
        min-height: 0;
        overflow: visible;
      }

      .trusted-form-panel[data-trusted-form-substep="consent"][aria-hidden="false"] {
        display: grid;
        min-height: 0;
        overflow: visible;
      }

      .trusted-form-review-scroll-shell {
        position: relative;
        align-self: stretch;
        height: 100%;
        min-height: 0;
        overflow: visible;
      }

      .trusted-form-review-scroll {
        height: 100%;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 0 4px 8px 0;
        -webkit-overflow-scrolling: touch;
      }

      .trusted-form-review-scroll-fade {
        position: absolute;
        right: 0;
        left: 0;
        z-index: 2;
        height: 32px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 140ms ease;
      }

      .trusted-form-review-scroll-fade-top {
        top: 0;
        background: linear-gradient(180deg, var(--surface), rgba(255, 253, 244, 0));
      }

      .trusted-form-review-scroll-fade-bottom {
        bottom: 0;
        background: linear-gradient(0deg, var(--surface), rgba(255, 253, 244, 0));
      }

      .trusted-form-review-scroll-shell[data-can-scroll-up="true"] .trusted-form-review-scroll-fade-top,
      .trusted-form-review-scroll-shell[data-can-scroll-down="true"] .trusted-form-review-scroll-fade-bottom {
        opacity: 1;
      }

      .trusted-form-review-list {
        display: grid;
        gap: 8px;
        margin: 0;
      }

      .trusted-form-review-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: baseline;
        border-bottom: 1px solid var(--border);
        padding: 0 0 8px;
      }

      .trusted-form-review-label {
        color: var(--muted);
        font-size: 0.9rem;
        font-weight: 700;
      }

      .trusted-form-review-value {
        max-width: 100%;
        color: var(--text);
        font-size: 0.95rem;
        font-weight: 800;
        text-align: right;
        word-break: break-word;
      }

      .trusted-form-field-bank {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        clip-path: inset(50%);
        white-space: nowrap;
      }

      .consent-check {
        display: flex;
        align-items: flex-start;
        gap: 14px;
        height: 100%;
        min-height: 0;
        overflow: visible;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: #ffffff;
        cursor: pointer;
        padding: 18px;
      }

      .consent-check:has(input:focus-visible) {
        border-color: var(--primary);
        box-shadow: 0 0 0 4px rgba(6, 77, 246, 0.13);
      }

      .consent-checkbox {
        width: 22px;
        height: 22px;
        flex: 0 0 auto;
        margin: 2px 0 0;
        accent-color: var(--accent);
      }

      .consent-scroll-shell {
        position: relative;
        align-self: stretch;
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
        overflow: visible;
      }

      .consent-scroll {
        display: block;
        height: 100%;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 0 4px 6px 0;
        -webkit-overflow-scrolling: touch;
      }

      @supports (scrollbar-gutter: stable) {
        .options,
        .autocomplete-suggestions,
        .trusted-form-review-scroll,
        .consent-scroll {
          scrollbar-gutter: stable;
        }
      }

      @media (hover: hover) and (pointer: fine) {
        .options,
        .autocomplete-suggestions,
        .trusted-form-review-scroll,
        .consent-scroll {
          scrollbar-color: rgba(6, 77, 246, 0.42) transparent;
          scrollbar-width: thin;
        }

        .options::-webkit-scrollbar,
        .autocomplete-suggestions::-webkit-scrollbar,
        .trusted-form-review-scroll::-webkit-scrollbar,
        .consent-scroll::-webkit-scrollbar {
          width: 10px;
        }

        .options::-webkit-scrollbar-thumb,
        .autocomplete-suggestions::-webkit-scrollbar-thumb,
        .trusted-form-review-scroll::-webkit-scrollbar-thumb,
        .consent-scroll::-webkit-scrollbar-thumb {
          border: 3px solid transparent;
          border-radius: 999px;
          background: rgba(6, 77, 246, 0.42);
          background-clip: content-box;
        }
      }

      @supports not selector(:has(*)) {
        .option input:focus-visible,
        .consent-checkbox:focus-visible {
          outline: 3px solid rgba(6, 77, 246, 0.3);
          outline-offset: 3px;
        }
      }

      .consent-scroll-fade {
        position: absolute;
        right: 0;
        left: 0;
        z-index: 2;
        height: 32px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 140ms ease;
      }

      .consent-scroll-fade-top {
        top: 0;
        background: linear-gradient(180deg, #ffffff, rgba(255, 255, 255, 0));
      }

      .consent-scroll-fade-bottom {
        bottom: 0;
        background: linear-gradient(0deg, #ffffff, rgba(255, 255, 255, 0));
      }

      .consent-scroll-shell[data-can-scroll-up="true"] .consent-scroll-fade-top,
      .consent-scroll-shell[data-can-scroll-down="true"] .consent-scroll-fade-bottom {
        opacity: 1;
      }

      .consent-copy {
        color: var(--text);
        font-size: 1rem;
        font-weight: 600;
        line-height: 1.5;
      }

      .consent-disclosure {
        font-size: 0.8rem;
      }

      .consent-acceptance {
        display: block;
        margin-top: 8px;
        color: var(--brand-navy);
        font-weight: 800;
      }

      .actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .button {
        display: inline-flex;
        min-height: 48px;
        align-items: center;
        justify-content: center;
        gap: 10px;
        border: 1px solid transparent;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 700;
        padding: 0 20px;
        text-decoration: none;
      }

      .actions-single {
        justify-content: flex-end;
      }

      .actions-welcome {
        justify-content: stretch;
      }

      .actions-welcome .button {
        width: 100%;
      }

      .form-panel[data-form-view="post-submit"] .actions-single {
        justify-content: stretch;
      }

      .form-panel[data-form-view="post-submit"] .actions-single .button {
        width: 100%;
      }

      .button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }

      .button-spinner {
        width: 1em;
        height: 1em;
        flex: 0 0 auto;
        border: 2px solid rgba(255, 255, 255, 0.42);
        border-top-color: #ffffff;
        border-radius: 999px;
        animation: button-spinner-spin 720ms linear infinite;
      }

      .button-label {
        min-width: 0;
      }

      .button-secondary {
        border-color: var(--border);
        background: #ffffff;
        color: var(--text);
      }

      .button-primary {
        background: var(--accent);
        color: #ffffff;
      }

      .button-primary:hover {
        background: #d9004d;
      }

      @keyframes button-spinner-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .error-modal {
        position: fixed;
        inset: 0;
        z-index: 20;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(255, 253, 244, 0.72);
      }

      .error-modal[hidden] {
        display: none;
      }

      .error-modal-panel {
        width: min(100%, 380px);
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
        box-shadow: 0 22px 60px rgba(1, 28, 76, 0.24);
        padding: 24px;
      }

      .error-modal-title {
        margin: 0 0 10px;
        color: var(--brand-navy);
        font-size: 1.25rem;
        line-height: 1.2;
      }

      .error-modal-message {
        margin: 0 0 20px;
        color: var(--text);
        font-size: 1rem;
        line-height: 1.45;
      }

      .error-modal-close {
        width: 100%;
        min-height: 48px;
        min-width: 0;
        padding: 0 20px;
        font-size: 1rem;
      }

      .thanks,
      .unavailable {
        width: min(100%, 720px);
        border: 1px solid var(--border);
        border-radius: 8px;
        background: rgba(255, 253, 244, 0.98);
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

      @keyframes matching-benefit-fade-in {
        from {
          opacity: 0;
        }

        to {
          opacity: 1;
        }
      }

      @keyframes matching-benefit-fade-out {
        from {
          opacity: 1;
        }

        to {
          opacity: 0;
        }
      }

      @media (min-width: 561px) {
        .form-panel {
          min-height: min(var(--form-desktop-height, 680px), calc(100vh - 48px));
          height: var(--form-desktop-height, 724px);
        }

        .step[data-step-kind="choice"] {
          --choice-options-gap: 16px;
          --choice-option-min-height: 78px;
          --choice-option-gap: 18px;
          --choice-option-padding-block: 20px;
          --choice-option-padding-inline: 24px;
          --choice-option-input-size: 24px;
          --choice-option-index-size: 34px;
          --choice-option-index-font-size: 0.95rem;
          --choice-option-text-font-size: 1.28rem;
        }

        .step[data-step-kind="choice"][data-choice-size="compact"] {
          --choice-options-gap: 10px;
          --choice-option-min-height: 62px;
          --choice-option-gap: 14px;
          --choice-option-padding-block: 13px;
          --choice-option-padding-inline: 18px;
          --choice-option-input-size: 21px;
          --choice-option-index-size: 30px;
          --choice-option-index-font-size: 0.9rem;
          --choice-option-text-font-size: 1.1rem;
        }

        .step[data-step-kind="choice"][data-choice-size="spacious"] {
          --choice-options-gap: 18px;
          --choice-option-min-height: 88px;
          --choice-option-gap: 20px;
          --choice-option-padding-block: 23px;
          --choice-option-padding-inline: 28px;
          --choice-option-input-size: 26px;
          --choice-option-index-size: 38px;
          --choice-option-text-font-size: 1.36rem;
        }

        .actions {
          gap: 16px;
        }

        .button {
          min-height: 70px;
          min-width: 190px;
          padding: 0 42px;
          font-size: 1.4rem;
        }
      }

      @media (max-width: 560px) {
        :root {
          --mobile-fluid-scale: min(1, calc(100vw / 500px));
          --mfs: var(--mobile-fluid-scale);
          --mfs-2: min(2px, 0.4vw);
          --mfs-3: min(3px, 0.6vw);
          --mfs-4: min(4px, 0.8vw);
          --mfs-6: min(6px, 1.2vw);
          --mfs-8: min(8px, 1.6vw);
          --mfs-10: min(10px, 2vw);
          --mfs-12: min(12px, 2.4vw);
          --mfs-14: min(14px, 2.8vw);
          --mfs-16: min(16px, 3.2vw);
          --mfs-18: min(18px, 3.6vw);
          --mfs-20: min(20px, 4vw);
          --mfs-22: min(22px, 4.4vw);
          --mfs-24: min(24px, 4.8vw);
          --mfs-28: min(28px, 5.6vw);
          --mfs-32: min(32px, 6.4vw);
          --mfs-34: min(34px, 6.8vw);
          --mfs-40: min(40px, 8vw);
          --mfs-42: min(42px, 8.4vw);
          --mfs-48: min(48px, 9.6vw);
          --mfs-56: min(56px, 11.2vw);
          --mfs-58: min(58px, 11.6vw);
          --mfs-64: min(64px, 12.8vw);
          --mfs-68: min(68px, 13.6vw);
          font-size: min(16px, 3.2vw);
        }

        html {
          height: 100%;
          background: var(--surface);
          overscroll-behavior: none;
        }

        body {
          position: fixed;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          overscroll-behavior: none;
          background: var(--surface);
        }

        .shell {
          align-items: stretch;
          height: 100dvh;
          min-height: 0;
          overflow: hidden;
          padding: 0;
        }

        .form-panel,
        .thanks,
        .unavailable {
          height: 100dvh;
          min-height: 0;
          width: 100%;
          border: 0;
          border-radius: 0;
          box-shadow: none;
          padding:
            calc(var(--mfs-40) + env(safe-area-inset-top))
            var(--mfs-24)
            calc(var(--mfs-32) + env(safe-area-inset-bottom));
        }

        .form-panel {
          gap: var(--mfs-28);
        }

        .form-panel[data-focused-step-kind="text"],
        .form-panel[data-focused-step-kind="phone"] {
          grid-template-rows: auto auto auto auto;
          align-content: start;
          overflow: hidden;
        }

        .form-panel[data-form-chrome="hidden"],
        .form-panel[data-form-chrome="hidden_on_mobile"] {
          grid-template-rows: minmax(0, 1fr) auto;
        }

        .form-panel[data-form-chrome="hidden_on_mobile"] .brand,
        .form-panel[data-form-chrome="hidden_on_mobile"] .progress-area {
          display: none;
        }

        .brand {
          align-items: flex-start;
          gap: var(--mfs-16);
        }

        .brand-logo {
          width: min(190px, 38vw);
        }

        .area-pill {
          font-size: 0.85rem;
          padding: var(--mfs-6) var(--mfs-12);
        }

        .progress-meta {
          bottom: calc(100% + var(--mfs-6));
        }

        .progress-shell {
          height: var(--mfs-8);
        }

        .step-count {
          font-size: 0.95rem;
        }

        .question-title {
          max-width: 100%;
          margin-bottom: var(--mfs-28);
        }

        .question-description {
          font-size: 1.05rem;
        }

        .matching-content {
          min-height: min(300px, 60vw);
          gap: var(--mfs-16);
        }

        .step[data-interstitial-timing="welcome"][aria-hidden="false"] {
          gap: var(--mfs-16);
        }

        .step[data-interstitial-timing="welcome"] .question-title {
          font-size: clamp(2rem, 8.2vw, 2.55rem);
          line-height: 1.05;
        }

        .welcome-content {
          gap: var(--mfs-16);
          padding: var(--mfs-2) var(--mfs-4) var(--mfs-2) 0;
        }

        .welcome-body {
          font-size: clamp(1rem, 4.2vw, 1.12rem);
          line-height: 1.35;
        }

        .welcome-benefits {
          gap: var(--mfs-10);
        }

        .welcome-benefit {
          grid-template-columns: var(--mfs-28) minmax(0, 1fr);
          gap: var(--mfs-12);
          min-height: var(--mfs-56);
          padding: var(--mfs-10) var(--mfs-12);
          font-size: clamp(0.95rem, 4vw, 1.05rem);
        }

        .welcome-benefit::before {
          width: var(--mfs-28);
          height: var(--mfs-28);
        }

        .welcome-benefit::after {
          left: calc(var(--mfs-12) + var(--mfs-10));
          width: var(--mfs-6);
          height: var(--mfs-10);
          border-width: 0 var(--mfs-3) var(--mfs-3) 0;
        }

        .step[data-step-kind="choice"] {
          --choice-options-gap: var(--mfs-12);
          --choice-option-min-height: var(--mfs-64);
          --choice-option-gap: var(--mfs-14);
          --choice-option-padding-block: var(--mfs-16);
          --choice-option-padding-inline: var(--mfs-18);
          --choice-option-input-size: var(--mfs-20);
          --choice-option-index-size: var(--mfs-28);
          --choice-option-index-radius: var(--mfs-6);
          --choice-option-index-font-size: 0.85rem;
          --choice-option-text-font-size: 1.15rem;
        }

        .step[data-step-kind="choice"][data-choice-size="compact"] {
          --choice-options-gap: var(--mfs-8);
          --choice-option-min-height: var(--mfs-56);
          --choice-option-gap: var(--mfs-12);
          --choice-option-padding-block: var(--mfs-12);
          --choice-option-padding-inline: var(--mfs-14);
          --choice-option-input-size: var(--mfs-18);
          --choice-option-index-size: var(--mfs-24);
          --choice-option-text-font-size: 1.02rem;
        }

        .step[data-step-kind="choice"][data-choice-size="spacious"] {
          --choice-options-gap: var(--mfs-16);
          --choice-option-min-height: var(--mfs-68);
          --choice-option-gap: var(--mfs-16);
          --choice-option-padding-block: var(--mfs-18);
          --choice-option-padding-inline: var(--mfs-20);
          --choice-option-input-size: var(--mfs-22);
          --choice-option-index-size: var(--mfs-32);
          --choice-option-text-font-size: 1.2rem;
        }

        .choice-options-fade,
        .autocomplete-scroll-fade,
        .trusted-form-review-scroll-fade,
        .consent-scroll-fade {
          height: var(--mfs-32);
        }

        .text-input {
          min-height: var(--mfs-68);
          border-bottom-width: var(--mfs-3);
          padding: var(--mfs-6) 0;
        }

        .autocomplete-suggestions-shell {
          margin-top: var(--mfs-12);
        }

        .autocomplete-suggestions {
          gap: var(--mfs-8);
          padding: var(--mfs-2) var(--mfs-4) var(--mfs-2) 0;
        }

        .autocomplete-suggestion {
          min-height: var(--mfs-48);
          padding: 0 var(--mfs-14);
        }

        .autocomplete-suggestion-value {
          margin-left: var(--mfs-6);
        }

        #steps {
          min-height: 0;
        }

        .actions {
          align-items: stretch;
          flex-direction: column;
          gap: var(--mfs-12);
        }

        .button {
          flex: 1;
          min-height: var(--mfs-58);
          gap: var(--mfs-10);
          padding: 0 var(--mfs-24);
          font-size: 1.12rem;
        }

        .button-spinner {
          border-width: var(--mfs-2);
        }

        .button-primary {
          order: 1;
        }

        .button-secondary {
          order: 2;
        }

        .step[data-step-kind="trusted_form_consent"][aria-hidden="false"] {
          gap: var(--mfs-14);
        }

        .trusted-form-panels {
          gap: var(--mfs-20);
        }

        .trusted-form-review-scroll {
          padding: 0 var(--mfs-4) var(--mfs-8) 0;
        }

        .trusted-form-review-list {
          gap: var(--mfs-8);
        }

        .trusted-form-review-row {
          gap: var(--mfs-12);
          padding-bottom: var(--mfs-8);
        }

        .trusted-form-review-label {
          font-size: 0.9rem;
        }

        .trusted-form-review-value {
          font-size: 0.95rem;
        }

        .consent-card {
          gap: var(--mfs-10);
        }

        .consent-check {
          gap: var(--mfs-14);
          padding: var(--mfs-14);
        }

        .consent-checkbox {
          width: var(--mfs-22);
          height: var(--mfs-22);
          margin-top: var(--mfs-2);
        }

        .consent-scroll {
          padding: 0 var(--mfs-4) var(--mfs-6) 0;
        }

        .consent-copy {
          font-size: 1rem;
        }

        .consent-acceptance {
          margin-top: var(--mfs-8);
        }

        .error-modal {
          padding: var(--mfs-24);
        }

        .error-modal-panel {
          padding: var(--mfs-24);
        }

        .error-modal-title {
          margin-bottom: var(--mfs-10);
          font-size: 1.25rem;
        }

        .error-modal-message {
          margin-bottom: var(--mfs-20);
          font-size: 1rem;
        }

        .error-modal-close {
          min-height: var(--mfs-48);
          padding: 0 var(--mfs-20);
          font-size: 1rem;
        }

        .thanks h1,
        .unavailable h1 {
          margin-bottom: var(--mfs-16);
        }

        .thanks p,
        .unavailable p {
          font-size: 1.1rem;
        }
      }
    </style>
`;
}
