## Change

<!-- What changed? -->

## Reason and impact

<!-- Why is this needed, and what behavior or evidence changes? -->

## Risk and controls

<!-- Rate the risk and name the controls or rollback plan. -->

## Validation and evidence

- [ ] `npm ci`
- [ ] `npm run check`
- [ ] `npm run audit:dependencies`
- [ ] `npm run verify:github-settings` when repository settings or rulesets changed
- [ ] `npm run check:evidence -- http://127.0.0.1:8787` when trust routes or evidence changed
- [ ] No credentials, production exports, or private identifiers were added
- [ ] Documentation and provenance were updated when required
