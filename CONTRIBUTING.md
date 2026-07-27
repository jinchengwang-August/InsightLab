# Contributing to InsightLab

Thank you for helping improve InsightLab.

- Search existing issues before opening a new one.
- Do not add secrets, production user data, private research files, or personal contact information.
- Discuss large schema, authentication, scoring-model, or visual-system changes in an issue first.
- Label demo, simulated, and live data clearly.
- Preserve the privacy boundary between public aggregate insights and private responses.
- Respect keyboard access and `prefers-reduced-motion`.

## Workflow

1. Fork the repository and create a focused branch.
2. Install with `npm ci`.
3. Make the smallest coherent change.
4. Run `npm run db:generate` after schema changes.
5. Run `npm run lint` and `npm test`.
6. Open a pull request with the problem, solution, verification, and screenshots.

Contributions are licensed under the MIT License.
