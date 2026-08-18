import {
  existsSync,
  mkdirSync
} from 'node:fs'

import path
  from 'node:path'

import {
  app
} from 'electron'

import type {
  SystemResourcePaths,
  UserResourcePaths
} from './types'


function assertAppReady():
  void {
  if (
    !app.isReady()
  ) {
    throw new Error(
      '[Resources] Resource paths can only be resolved after Electron app is ready.'
    )
  }
}


export function getSystemResourceRoot():
  string {
  assertAppReady()

  if (
    app.isPackaged
  ) {
    return path.resolve(
      process.resourcesPath,
      'fat'
    )
  }

  const candidates = [
    path.resolve(
      app.getAppPath(),
      'resources',
      'fat'
    ),

    path.resolve(
      process.cwd(),
      'resources',
      'fat'
    )
  ]

  const existing =
    candidates.find(
      candidate =>
        existsSync(
          candidate
        )
    )

  return (
    existing ??
    candidates[0]
  )
}


export function getSystemResourcePaths():
  SystemResourcePaths {
  const root =
    getSystemResourceRoot()

  const configDir =
    path.join(
      root,
      'config'
    )

  const catalogDir =
    path.join(
      root,
      'catalog'
    )

  const schemasDir =
    path.join(
      root,
      'schemas'
    )

  const modelsDir =
    path.join(
      root,
      'models'
    )

  return {
    root,

    configDir,

    appConfigFile:
      path.join(
        configDir,
        'app.yaml'
      ),

    catalogDir,

    builtinCatalogFile:
      path.join(
        catalogDir,
        'builtin-resources.yaml'
      ),

    schemasDir,

    resourceSchemaFile:
      path.join(
        schemasDir,
        'resource.schema.yaml'
      ),

    charactersDir:
      path.join(
        root,
        'characters'
      ),

    modelsDir,

    live2dModelsDir:
      path.join(
        modelsDir,
        'live2d'
      ),

    brainDir:
      path.join(
        root,
        'brain'
      ),

    sttDir:
      path.join(
        root,
        'stt'
      ),

    ttsDir:
      path.join(
        root,
        'tts'
      )
  }
}


export function getUserResourcePaths():
  UserResourcePaths {
  assertAppReady()

  const root =
    path.join(
      app.getPath(
        'userData'
      ),
      'fat-data'
    )

  const catalogDir =
    path.join(
      root,
      'catalog'
    )

  const libraryDir =
    path.join(
      root,
      'library'
    )

  const visualDir =
    path.join(
      libraryDir,
      'visual'
    )

  return {
    root,

    catalogDir,

    resourcesCatalogFile:
      path.join(
        catalogDir,
        'resources.json'
      ),

    libraryDir,

    charactersDir:
      path.join(
        libraryDir,
        'characters'
      ),

    visualDir,

    live2dModelsDir:
      path.join(
        visualDir,
        'live2d'
      ),

    brainDir:
      path.join(
        libraryDir,
        'brain'
      ),

    sttDir:
      path.join(
        libraryDir,
        'stt'
      ),

    ttsDir:
      path.join(
        libraryDir,
        'tts'
      ),

    cacheDir:
      path.join(
        root,
        'cache'
      ),

    logsDir:
      path.join(
        root,
        'logs'
      ),

    conversationsDir:
      path.join(
        root,
        'conversations'
      )
  }
}


export function ensureUserResourceDirectories():
  UserResourcePaths {
  const paths =
    getUserResourcePaths()

  const directories = [
    paths.root,
    paths.catalogDir,
    paths.libraryDir,
    paths.charactersDir,
    paths.visualDir,
    paths.live2dModelsDir,
    paths.brainDir,
    paths.sttDir,
    paths.ttsDir,
    paths.cacheDir,
    paths.logsDir,
    paths.conversationsDir
  ]

  directories.forEach(
    directory => {
      mkdirSync(
        directory,
        {
          recursive:
            true
        }
      )
    }
  )

  return paths
}