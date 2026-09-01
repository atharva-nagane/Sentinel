# Gateway internals

`requestTracing/requestId.js` runs first on every request and ensures an
`x-request-id` header exists. Each router in `routing/` must read that header off
`req` and pass it along on its outbound call to the target service, so a request
stays traceable end to end. See `docs/apiContracts.md` for the header name and
downstream payload shapes.
