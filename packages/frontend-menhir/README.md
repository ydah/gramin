# @gramin/frontend-menhir

Menhir grammar frontend for gramin.

## Installation

```sh
npm install @gramin/frontend-menhir
```

The package exports `menhirFrontend`, `FRONTEND_MENHIR_ID`, and
`FRONTEND_MENHIR_VERSION`. It converts the supported Menhir syntax to the versioned
Grammar IR contract from `@gramin/core` without executing semantic actions.

See the [known limitations](https://github.com/ydah/gramin/blob/main/docs/known-limitations.md)
before integrating arbitrary third-party grammars.

## License

MIT
