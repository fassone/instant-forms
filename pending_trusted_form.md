# Pending TrustedForm Work

## Context

We rolled the repo back to `ef04f317a22feeef99565634d6581d587279fc40` after several TrustedForm experiments became too noisy to keep safely. The goal of this document is to preserve the useful findings and define the next clean implementation path for reliably capturing TrustedForm proof-of-consent submit events.

The important target is not only generating `xxTrustedFormCertUrl`. A successful implementation must make TrustedForm record the real form submit event so the certificate reflects submitted-lead proof of consent, including in privacy-focused browsers such as Brave.

## What We Learned

- Safari could record the expected TrustedForm flow when the page used a traditional form shape.
- Brave could create the certificate and record opt-in activity, but it may block TrustedForm follow-up event or beacon requests needed to record `submitted form`.
- The diagnostic path that worked used:
  - a real native `<form method="post">`;
  - hidden-but-real lead fields, not values invented only at submit time;
  - TrustedForm consent tags for offer, consent language, opt-in, submit, grantor name, and grantor phone;
  - a real visible submit control named `trusted_form_submit`;
  - first-party proxied TrustedForm SDK loading.
- Certificate creation alone is insufficient. The event log must include `submitted form`.
- Cloudflare Insights requests seen during tunnel testing are probably tunnel noise and should not drive the product implementation unless later proven to be required by TrustedForm.

## Future Implementation Requirements

- Render the final consent step as a real native form submit, while preserving normal JavaScript-driven behavior for earlier steps.
- Load TrustedForm only on the consent step. Earlier form steps must not request TrustedForm scripts or initialize TrustedForm side effects.
- Use real fields in the form before submission for the lead data TrustedForm needs to observe:
  - grantor name;
  - grantor phone;
  - grantor email when future flows collect it.
- Keep TrustedForm consent tagging explicit:
  - `data-tf-element-role="offer"` on the consent form;
  - `data-tf-element-role="consent-language"` on the consent language;
  - `data-tf-element-role="consent-opt-in"` on the checkbox;
  - `data-tf-element-role="submit"` on the real submit control;
  - `data-tf-element-role="consent-grantor-name"` on the resolved name field;
  - `data-tf-element-role="consent-grantor-phone"` on the resolved phone field;
  - `data-tf-element-role="consent-grantor-email"` when email exists.
- Serve TrustedForm SDK bootstrap and core scripts through first-party allowlisted proxy URLs.
- Add a browser-side shim before TrustedForm loads to rewrite TrustedForm requests to first-party proxy URLs when the SDK uses:
  - `fetch`;
  - `XMLHttpRequest`;
  - `navigator.sendBeacon`;
  - `img.src`, `script.src`, and `iframe.src`;
  - `setAttribute("src", ...)`;
  - HTML-string injection paths such as `document.write`, `document.writeln`, and `insertAdjacentHTML`.
- Keep the proxy allowlist-only. It must proxy only known TrustedForm domains and must never become an arbitrary URL proxy.
- Keep backend claim/retain work separate from browser proof-of-consent capture. Claiming or retaining a certificate cannot replace the browser event log requirement.

## Success Criteria

- In Safari, Chrome, and Brave, the TrustedForm event log for the real form flow shows:
  - certificate created;
  - consent language detected;
  - opt-in recorded;
  - submit control clicked;
  - `submitted form`.
- The generated certificate receives the submitted-lead retention window expected for a real lead submit.
- Brave Network shows no direct blocked TrustedForm request required for submit-event capture.
- The browser submits the final consent step through a real native form POST.
- The server still receives and logs the TrustedForm certificate URL with the final submission.
- No TrustedForm scripts load before the consent step.

## Test Plan

- Manual browser matrix:
  - Safari with direct SDK loading as a baseline.
  - Safari with first-party proxied SDK loading.
  - Chrome with first-party proxied SDK loading.
  - Brave with Shields enabled and first-party proxied SDK loading.
- Manual checks:
  - Verify the final consent step contains the real lead fields before submit.
  - Verify the final submit control is a native submit control tagged for TrustedForm.
  - Verify the network panel has no blocked direct TrustedForm request needed for submit-event capture.
  - Verify TrustedForm event logs include `submitted form`.
- Automated tests to add with the clean implementation:
  - server-rendered consent step contains the required TrustedForm tags and real prefilled lead fields;
  - TrustedForm SDK is absent from all pre-consent steps;
  - first-party script proxy rejects non-TrustedForm targets;
  - proxy does not forward visitor cookies;
  - browser shim is present before the TrustedForm SDK in proxied mode;
  - native final submit posts the certificate URL and normalized answers to the server;
  - earlier steps keep existing optimistic JavaScript navigation behavior.
