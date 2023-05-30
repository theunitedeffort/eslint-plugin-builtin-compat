const bcd = require('@mdn/browser-compat-data')
const semver = require('semver')
const { chain, get } = require('lodash')
const { startsWithLowercase } = require('./utils')

function isMethod(name) {
  // TODO: implement symbols checker
  // skipping symbols for now
  if (name.startsWith('@@')) {
    return false
  }
  return startsWithLowercase(name) && !name.includes('_')
}

function convertNamedVersion(version) {
  if (version === 'all') {
    return '0';
  }
  if (version === 'preview') {
    return false
  }
  return version;
}

// parameter values: version string, true, false, null
// true < 9 < 11.1 < false == null
function gtVersion(v1, v2) {
  v1 = convertNamedVersion(v1);
  v2 = convertNamedVersion(v2);
  if (!v2) {
    return false
  }
  if (typeof v1 === 'boolean' || !v1) {
    return !v1
  }
  return semver.gt(semver.coerce(v1), semver.coerce(v2))
}

function findUnsupportedBrowsers(minBrowsers, supportedBrowsers) {
  function filterUnsupported(browserKey) {
    const descriptor = supportedBrowsers[browserKey]
    if (Array.isArray(descriptor)) {
      // TODO: support array descriptors
      return false
    }
    const suppVersion = descriptor.version_added
    const minVersion = minBrowsers[browserKey]
    return gtVersion(suppVersion, minVersion)
  }

  function toSupportEntries(browserKey) {
    const descriptor = supportedBrowsers[browserKey]
    return {
      browser: browserKey,
      version_added: descriptor.version_added,
      min_version: minBrowsers[browserKey],
    }
  }
  return Object.keys(supportedBrowsers)
    .filter(filterUnsupported)
    .map(toSupportEntries)
}

function composeData(name, path, data, options) {
  if (name === '__compat') {
    return []
  }
  const { minBrowsers, ignoredBuiltins } = options
  const nextPath = path.concat(name)

  const result = chain(data)
    .keys()
    .flatMap(n => composeData(n, nextPath, data[n], options))
    .value()

  if (isMethod(name) && data.__compat) {
    const supportedBrowsers = data.__compat.support
    const unsupported = findUnsupportedBrowsers(minBrowsers, supportedBrowsers)
    const qualName = path.concat(name).join('.');
    result.push({ name, path, qualName, unsupported })
  }
  return result
}

function makeMethodsTable(data, options) {
  return chain(data)
    .keys()
    .flatMap(n => composeData(n, [], data[n], options))
    // Filter out ignored builtins and builtins that are fully supported.
    .pickBy(r => r.unsupported.length && !options.ignoredBuiltins.some(pattern => pattern.test(r.qualName)))
    .groupBy('name')
    .value()
}

function makeChecker(minBrowsers, ignoredBuiltins = []) {
  const options = { minBrowsers, ignoredBuiltins }
  const methods = makeMethodsTable(bcd.javascript.builtins, options)
  function check(node) {
    const { name } = node.property
    return methods[name]
  }
  return { check }
}

module.exports = { makeChecker }
