# SharkTank

SharkTank is a realtime multiplayer workload and a governed production-system
case study. The deployed product remains at
[sharktank.wizardgang.ai](https://sharktank.wizardgang.ai).

This repository begins with a deliberately small, buildable foundation. Its public
history is reconstructed from the private legacy implementation and deployed system;
it does not pretend that reconstructed commits were the original commits.

See [`docs/RECONSTRUCTION.md`](docs/RECONSTRUCTION.md) for the method and
[`docs/history/CHANGE-MAP.csv`](docs/history/CHANGE-MAP.csv) for provenance.

## Validate this state

```bash
npm install
npm run typecheck
npm run build
```

No test suite exists at this point in the reconstructed history.

