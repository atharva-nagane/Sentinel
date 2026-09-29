# Fault injection internals

Each injector under `injectors/` implements one `command` value from
`docs/apiContracts.md` section 5. The dashboard sends commands matching that
shape; `index.js` dispatches on `command` to the matching injector with
`targetService` and `params`.

`killService` and `overloadService` are owned by Swayum Bansal (Member 5).
`addLatency` is owned by Atharva Nagane (Member 4, Recovery) by team agreement -
it lives here for dispatcher symmetry but is implemented and maintained as part
of the recovery workstream.
