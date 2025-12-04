#!/usr/bin/env -S node --loader ts-node/esm --no-warnings=ExperimentalWarning

const oclif = require('@oclif/core')

oclif.run().then(require('@oclif/core/flush')).catch(require('@oclif/core/handle'))
