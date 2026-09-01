# Fault injection internals

Each injector under `injectors/` implements one `command` value from
`docs/apiContracts.md` section 5. The dashboard sends commands matching that
shape; `index.js` dispatches on `command` to the matching injector with
`targetService` and `params`.
