# src/authoring/flows/tn

## Purpose

`src/authoring/flows/tn/` contains the Tennessee Seguros Aseguranza authored form.

```mermaid
flowchart TD
  Start["vive-en-tennessee"] --> State{"Lives in TN?"}
  State -->|"no"| Residence["estado-donde-vive"]
  State -->|"yes"| License["tiene-licencia"]
  Residence --> License
  License --> Insurance["tiene-seguro"]
  Insurance --> Title["titulo-limpio"]
  Title --> Cars["autos-a-asegurar"]
  Cars --> Match["buscando-oferta"]
  Match --> Contact["nombre / apellido / telefono"]
```

## Belongs Here

- Tennessee metadata, labels, slugs, question order, and authored conditional visibility.
- Tennessee matching-step benefit and success copy.

## Does Not Belong Here

- Generic DSL implementation.
- Validation adapters or phone/autocomplete algorithms.
- Page shell styling.

## Change Safely

Changing order or visibility can affect browser history and checkpoints. Update route and rendering tests with any authored flow change.
