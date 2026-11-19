## Description

Explain the change, motivation, and relevant feature/roadmap item.

## Areas affected

- [ ] Main process / native integration
- [ ] Preload / IPC contract / security
- [ ] Renderer / accessibility / animation
- [ ] Build / release / dependencies
- [ ] Documentation / optional branch plan

## Validation

- [ ] `cd app && npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:ui`
- [ ] Native desktop smoke tests, where relevant (list platforms below)

## Review checklist

- [ ] Runtime inputs validated and IPC sender restricted
- [ ] No secrets or sensitive log payloads added
- [ ] Loading, error, keyboard, and reduced-motion states considered
- [ ] Roadmap and branch `FEATURE.md` reflect actual implementation status
- [ ] Limitations and unrun tests stated explicitly