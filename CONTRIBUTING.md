# Contributing

- **Branches:** work on a feature branch and open a PR into `prime`. `prime` is protected and requires green CI.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:` …).
- **Changesets:** any PR that changes published behavior needs one (`npm run changeset`).
- **Quality bar:** strict TypeScript, tests for every part, keyboard and screen-reader support, and a `prefers-reduced-motion` equivalent for every motion effect. Browser features must be Baseline Widely Available, with newer ones only as progressive enhancement.
- **Clean-room rule:** GElement re-implements ideas from an earlier, proprietary library (QElement). Never paste code from that or any other non-MIT-compatible source.
