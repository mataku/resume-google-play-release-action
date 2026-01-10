import * as core from '@actions/core'
import { androidpublisher } from '@googleapis/androidpublisher'
import { readFileSync } from 'fs'
import { GoogleAuth } from 'google-auth-library'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const packageName = core.getInput('package-name')
    const versionName = core.getInput('version-name')
    const googleAccountJsonFilePath = core.getInput(
      'google-account-json-file-path'
    )
    const googleAccountJson = core.getInput('google-account-json')
    const track = core.getInput('track')

    core.info(`Package name: ${packageName}`)
    core.info(`Version name: ${versionName}`)
    core.info(`Track: ${track}`)

    const googleApplicationCredentials =
      process.env.GOOGLE_APPLICATION_CREDENTIALS

    if (
      !googleApplicationCredentials &&
      !googleAccountJsonFilePath &&
      !googleAccountJson
    ) {
      throw new Error(
        'Either google-account-json-file-path or google-account-json must be provided. You can also use GOOGLE_APPLICATION_CREDENTIALS environment variable (e.g., set by google-github-actions/auth).'
      )
    }

    let credentials: object
    if (googleApplicationCredentials) {
      core.info(
        `Using GOOGLE_APPLICATION_CREDENTIALS for authentication: ${googleApplicationCredentials}`
      )
      credentials = JSON.parse(
        readFileSync(googleApplicationCredentials, 'utf-8')
      )
    } else if (googleAccountJson) {
      core.info('Using google-account-json for authentication')
      credentials = JSON.parse(googleAccountJson)
    } else {
      core.info(
        `Using google-account-json-file-path for authentication: ${googleAccountJsonFilePath}`
      )
      credentials = JSON.parse(readFileSync(googleAccountJsonFilePath, 'utf-8'))
    }

    // Authenticate with Google Play API
    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher']
    })

    const androidPublisherClient = androidpublisher({
      version: 'v3',
      auth
    })

    core.info('Creating edit...')
    // Create an edit
    const editResponse = await androidPublisherClient.edits.insert({
      packageName
    })

    const editId = editResponse.data.id
    if (!editId) {
      throw new Error('Failed to create edit')
    }

    core.info(`Edit created with ID: ${editId}`)

    // Get the current track release
    core.info(`Getting track info for: ${track}`)
    const trackResponse = await androidPublisherClient.edits.tracks.get({
      packageName,
      editId,
      track
    })

    const releases = trackResponse.data.releases || []
    core.info(`Found ${releases.length} releases in track ${track}`)

    // Find the release with the specified version
    const targetRelease = releases.find((release) => {
      const versionCodes = release.versionCodes || []
      core.debug(
        `Checking release with version codes: ${versionCodes.join(', ')}`
      )
      return release.name === versionName
    })

    if (!targetRelease) {
      throw new Error(
        `Release with version name ${versionName} not found in track ${track}`
      )
    }

    core.info(`Found release: ${targetRelease.name}`)
    core.info(`Current status: ${targetRelease.status}`)

    // Determine the new status based on user_fraction
    const newStatus = targetRelease.userFraction ? 'inProgress' : 'completed'
    core.info(
      `user_fraction: ${targetRelease.userFraction ?? 'not set'}, setting status to: ${newStatus}`
    )

    // Update the release status
    const updatedReleases = releases.map((release) => {
      if (release.name === versionName) {
        return {
          ...release,
          status: newStatus
        }
      }
      return release
    })

    core.info(`Updating track ${track} to resume release ${versionName}...`)
    await androidPublisherClient.edits.tracks.update({
      packageName,
      editId,
      track,
      requestBody: {
        track,
        releases: updatedReleases
      }
    })

    // Commit the edit
    core.info('Committing edit...')
    await androidPublisherClient.edits.commit({
      packageName,
      editId
    })

    core.info(`Successfully resumed release ${versionName} in track ${track}`)
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}
