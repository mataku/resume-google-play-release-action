/**
 * Unit tests for the action's main functionality, src/main.ts
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

// Mock androidpublisher
const mockEdits = {
  insert: jest.fn(),
  tracks: {
    get: jest.fn(),
    update: jest.fn()
  },
  commit: jest.fn()
}

const mockAndroidPublisher = jest.fn(() => ({
  edits: mockEdits
}))

const mockGoogleAuth = jest.fn()

jest.unstable_mockModule('@googleapis/androidpublisher', () => ({
  androidpublisher: mockAndroidPublisher
}))

jest.unstable_mockModule('google-auth-library', () => ({
  GoogleAuth: mockGoogleAuth
}))

// Mock fs
const mockReadFileSync = jest.fn()
jest.unstable_mockModule('fs', () => ({
  readFileSync: mockReadFileSync
}))

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)

// The module being tested should be imported dynamically.
const { run } = await import('../src/main.js')

describe('main.ts', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Set up default mock implementations
    core.getInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'package-name': 'com.example.app',
        'version-name': '1.0.0',
        'google-account-json-file-path': '/path/to/google-account.json',
        'google-account-json': '',
        track: 'production'
      }
      return inputs[name] || ''
    })

    mockReadFileSync.mockReturnValue(
      JSON.stringify({ type: 'service_account', project_id: 'test-project' })
    )

    // Reset mockAndroidPublisher to return mockEdits
    mockAndroidPublisher.mockReturnValue({
      edits: mockEdits
    })

    mockEdits.insert.mockResolvedValue({
      data: { id: 'test-edit-id' }
    })

    mockEdits.tracks.get.mockResolvedValue({
      data: {
        releases: [
          {
            name: '1.0.0',
            status: 'halted',
            versionCodes: [1]
          }
        ]
      }
    })

    mockEdits.tracks.update.mockResolvedValue({
      data: {}
    })

    mockEdits.commit.mockResolvedValue({
      data: {}
    })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('Successfully resumes a halted release without userFraction (sets to completed)', async () => {
    await run()

    // Verify that the edit was created
    expect(mockEdits.insert).toHaveBeenCalledWith({
      packageName: 'com.example.app'
    })

    // Verify that the track was retrieved
    expect(mockEdits.tracks.get).toHaveBeenCalledWith({
      packageName: 'com.example.app',
      editId: 'test-edit-id',
      track: 'production'
    })

    // Verify that the track was updated with completed status (no userFraction)
    expect(mockEdits.tracks.update).toHaveBeenCalledWith({
      packageName: 'com.example.app',
      editId: 'test-edit-id',
      track: 'production',
      requestBody: {
        track: 'production',
        releases: [
          {
            name: '1.0.0',
            status: 'completed',
            versionCodes: [1]
          }
        ]
      }
    })

    // Verify that the edit was committed
    expect(mockEdits.commit).toHaveBeenCalledWith({
      packageName: 'com.example.app',
      editId: 'test-edit-id'
    })
  })

  it('Successfully resumes a halted release with userFraction (sets to inProgress)', async () => {
    // Mock a release with userFraction
    mockEdits.tracks.get.mockResolvedValue({
      data: {
        releases: [
          {
            name: '1.0.0',
            status: 'halted',
            versionCodes: [1],
            userFraction: 0.1
          }
        ]
      }
    })

    await run()

    // Verify that the track was updated with inProgress status (has userFraction)
    expect(mockEdits.tracks.update).toHaveBeenCalledWith({
      packageName: 'com.example.app',
      editId: 'test-edit-id',
      track: 'production',
      requestBody: {
        track: 'production',
        releases: [
          {
            name: '1.0.0',
            status: 'inProgress',
            versionCodes: [1],
            userFraction: 0.1
          }
        ]
      }
    })

    // Verify that the edit was committed
    expect(mockEdits.commit).toHaveBeenCalled()
  })

  it('Fails when release is not found', async () => {
    mockEdits.tracks.get.mockResolvedValue({
      data: {
        releases: [
          {
            name: '2.0.0',
            status: 'halted',
            versionCodes: [2]
          }
        ]
      }
    })

    await run()

    // Verify that the action failed
    expect(core.setFailed).toHaveBeenCalledWith(
      'Release with version name 1.0.0 not found in track production'
    )
  })

  it('Fails when edit creation fails', async () => {
    mockEdits.insert.mockResolvedValue({
      data: { id: undefined }
    })

    await run()

    // Verify that the action failed
    expect(core.setFailed).toHaveBeenCalledWith('Failed to create edit')
  })

  it('Successfully resumes a release using google-account-json', async () => {
    // Override getInput to use google-account-json instead of file path
    core.getInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'package-name': 'com.example.app',
        'version-name': '1.0.0',
        'google-account-json-file-path': '',
        'google-account-json': JSON.stringify({
          type: 'service_account',
          project_id: 'test-project'
        }),
        track: 'production'
      }
      return inputs[name] || ''
    })

    await run()

    // Verify that readFileSync was not called
    expect(mockReadFileSync).not.toHaveBeenCalled()

    // Verify that the action succeeded
    expect(mockEdits.commit).toHaveBeenCalled()
  })

  it('Prioritizes google-account-json when both are provided', async () => {
    // Provide both authentication methods
    core.getInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'package-name': 'com.example.app',
        'version-name': '1.0.0',
        'google-account-json-file-path': '/path/to/google-account.json',
        'google-account-json': JSON.stringify({
          type: 'service_account',
          project_id: 'test-project'
        }),
        track: 'production'
      }
      return inputs[name] || ''
    })

    await run()

    // Verify that readFileSync was not called (google-account-json was prioritized)
    expect(mockReadFileSync).not.toHaveBeenCalled()

    // Verify that the action succeeded
    expect(mockEdits.commit).toHaveBeenCalled()
  })

  it('Fails when neither authentication method is provided', async () => {
    core.getInput.mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        'package-name': 'com.example.app',
        'version-name': '1.0.0',
        'google-account-json-file-path': '',
        'google-account-json': '',
        track: 'production'
      }
      return inputs[name] || ''
    })

    await run()

    // Verify that the action failed
    expect(core.setFailed).toHaveBeenCalledWith(
      'Either google-account-json-file-path or google-account-json must be provided'
    )
  })

  it('Handles multiple releases in track correctly', async () => {
    // Mock multiple releases
    mockEdits.tracks.get.mockResolvedValue({
      data: {
        releases: [
          {
            name: '0.9.0',
            status: 'completed',
            versionCodes: [9]
          },
          {
            name: '1.0.0',
            status: 'halted',
            versionCodes: [10],
            userFraction: 0.5
          },
          {
            name: '1.1.0',
            status: 'draft',
            versionCodes: [11]
          }
        ]
      }
    })

    await run()

    // Verify that only the target release was updated
    expect(mockEdits.tracks.update).toHaveBeenCalledWith({
      packageName: 'com.example.app',
      editId: 'test-edit-id',
      track: 'production',
      requestBody: {
        track: 'production',
        releases: [
          {
            name: '0.9.0',
            status: 'completed',
            versionCodes: [9]
          },
          {
            name: '1.0.0',
            status: 'inProgress',
            versionCodes: [10],
            userFraction: 0.5
          },
          {
            name: '1.1.0',
            status: 'draft',
            versionCodes: [11]
          }
        ]
      }
    })
  })
})
