// Name: AWS S3 
// Description: A utility to interact with s3 buckets
// Keyword: AWS
// Author: Aaron Walker, Ph. D. 

/**
 * AWS S3 Utility Script
 *
 * This script provides a command-line utility for interacting with AWS S3 buckets using the Script Kit framework.
 * It allows users to list, upload, download, view, edit, and delete objects in S3 buckets.
 * The script leverages the AWS SDK for JavaScript (v3) and supports multiple AWS regions and credentials.
 *
 * Key Features:
 * - List S3 buckets and their contents, including folders and files.
 * - Navigate through bucket folders with support for returning to previous levels.
 * - Upload files to a specified path within a bucket, with overwrite confirmation.
 * - Download files from S3 buckets to the local filesystem.
 * - Open text files in an editor for viewing and modification.
 * - Save modified files either locally or back to the S3 bucket.
 * - Display images directly within the script interface.
 * - Delete files from S3 buckets with confirmation.
 *
 * Usage:
 * - Initialize AWS credentials and region using environment variables.
 * - Select an S3 bucket to interact with from the list of available buckets.
 * - Use the provided options to navigate folders, upload files, download files, edit text files, and delete files.
 *
 * Requirements:
 * - AWS SDK for JavaScript (v3)
 * - Script Kit framework
 * - js-yaml and node-jq packages for handling YAML and JSON formatting
 *
 * Author:
 * Aaron Walker, Ph. D. (twitter: @aaronhwalker github: DrTrojanDevil)
 */

import "@johnlindquist/kit"
import { S3Client, ListBucketsCommand, ListObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import yaml from 'js-yaml'
import jq from 'node-jq'

//TODO
//1. add some commands to change aws creds and region 

// Initialize environment variables
const accessKeyId = await env("AWS_ACCESS_KEY_ID", "Enter your AWS Access Key ID")
const secretAccessKey = await env("AWS_SECRET_ACCESS_KEY", "Enter your AWS Secret Access Key")
const awsRegion = await env("AWS_REGION", "us-west-2");

// Initialize AWS S3 client
const s3 = new S3Client({
  region: awsRegion,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
})

// SVG icons
const icons = {
  bucketIcon: `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M12 2C10.895 2 10 2.895 10 4H4C3.447 4 3 4.447 3 5V7C3 7.553 3.447 8 4 8V20C4 21.104 4.896 22 6 22H18C19.104 22 20 21.104 20 20V8C20.553 8 21 7.553 21 7V5C21 4.447 20.553 4 20 4H14C14 2.895 13.105 2 12 2zM10 4H14C14.553 4 15 4.447 15 5H9C9 4.447 9.447 4 10 4zM5 7V5H19V7H5zM6 20V8H18V20H6z"/>
  </svg>
  `,
  folderIcon: `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M10 4L12 6H20C21.104 6 22 6.896 22 8V18C22 19.104 21.104 20 20 20H4C2.896 20 2 19.104 2 18V6C2 4.896 2.896 4 4 4H10zM4 8V18H20V8H4z"/>
  </svg>
  `,
  fileIcon: `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M14 2H6C4.896 2 4 2.896 4 4V20C4 21.104 4.896 22 6 22H18C19.104 22 20 21.104 20 20V8L14 2zM14 4L18 8H14V4zM6 4H12V9H18V20H6V4z"/>
  </svg>
  `,
  uploadIcon: `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M12 2L7 7H10V15H14V7H17L12 2zM5 19H19V21H5V19z"/>
  </svg>
  `
};

function isTextFile(key: string) {
  const txtTypes = {
    '.txt': 'plaintext',
    '.json': 'json',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.js': 'javascript',
    '.ts': 'typescript',
    '.html': 'html',
    '.css': 'css',
    '.md': 'markdown',
    '.xml': 'xml',
    '.sh': 'shell',
    '.py': 'python',
  }
  for (const t of Object.keys(txtTypes)) {
    if (key.endsWith(t)) {
      return txtTypes[t]
    }
  }
  return null;
}

async function confirmAction(message: string): Promise<boolean> {
  const confirm = await arg(message, [
    { name: 'Yes', value: 'yes' },
    { name: 'No', value: 'no' },
  ])
  return confirm === 'yes'
}

async function* s3Explorer(bucketName: string, prefix: string = "") {
  const history: string[] = []

  try {
    while (true) {
      const objectCommand = new ListObjectsCommand({ Bucket: bucketName, Prefix: prefix, Delimiter: '/' })
      const objectData = await s3.send(objectCommand)

      if ((!objectData.Contents || objectData.Contents.length === 0) && (!objectData.CommonPrefixes || objectData.CommonPrefixes.length === 0)) {
        await div(md(`### No objects found in bucket: ${bucketName} with prefix: ${prefix}`))
        return
      }

      const items = [
        { name: "Return to Bucket Selection", value: "RETURN_TO_BUCKET_SELECTION", html: `<div style="display: flex; align-items: center;">${icons.bucketIcon}<span style="margin-left: 10px;">Return to Bucket Selection</span></div>` },
        ...(prefix ? [{ name: "..", value: "..", html: `<div style="display: flex; align-items: center;">${icons.folderIcon}<span style="margin-left: 10px;">..</span></div>` }] : []),
        { name: "Upload", value: "UPLOAD", html: `<div style="display: flex; align-items: center;">${icons.uploadIcon}<span style="margin-left: 10px;">Upload</span></div>` },
        ...(objectData.CommonPrefixes || []).map(item => ({
          name: item.Prefix || "Unnamed Prefix",
          value: item.Prefix || "Unnamed Prefix",
          html: `<div style="display: flex; align-items: center;">${icons.folderIcon}<span style="margin-left: 10px;">${item.Prefix}</span></div>`
        })),
        ...(objectData.Contents || []).map(item => {
          const key = item.Key || "Unnamed Key";
          return {
            name: key,
            value: key,
            preview: async () => {
              const headObjectCommand = new HeadObjectCommand({ Bucket: bucketName, Key: key })
              const headData = await s3.send(headObjectCommand)
              const contentType = headData.ContentType || ""

              const getObjectCommand = new GetObjectCommand({ Bucket: bucketName, Key: key })
              const url = await getSignedUrl(s3, getObjectCommand, { expiresIn: 3600 })

              if (contentType.startsWith("image/")) {
                return md(`### ${key}\n![${key}](${url})`)
              } else if (contentType === "application/json" || key.endsWith(".json")) {
                const response = await fetch(url)
                const jsonData = await response.json()
                const formattedJson = await jq.run('.', jsonData, { input: 'json' })
                return md(`### ${key}\n\`\`\`json\n${formattedJson}\n\`\`\``)
              } else if (contentType === "application/x-yaml" || contentType === "text/yaml" || key.endsWith(".yml") || key.endsWith(".yaml")) {
                const response = await fetch(url)
                const yamlData = await response.text()
                const formattedYaml = yaml.dump(yaml.load(yamlData))
                return md(`### ${key}\n\`\`\`yaml\n${formattedYaml}\n\`\`\``)
              } else {
                const response = await fetch(url)
                const textData = await response.text()
                return md(`### ${key}\n\`\`\`text\n${textData}\n\`\`\``)
              }
            },
            html: `<div style="display: flex; align-items: center;">${icons.fileIcon}<span style="margin-left: 10px;">${key}</span></div>`
          }
        })
      ]

      const selectedItem = yield await arg(`Select an item in ${bucketName} (prefix: ${prefix})`, items, {
        onAbandon: () => {
          if (history.length > 0) {
            prefix = history.pop() || ''
            arg.hint = ""
          } else {
            prefix = ""
            arg.hint = ""
          }
        },
      })

      if (selectedItem === "RETURN_TO_BUCKET_SELECTION") {
        return
      } else if (selectedItem === "..") {
        if (history.length > 0) {
          prefix = history.pop() || ''
        } else {
          prefix = ""
        }
      } else if (selectedItem === "UPLOAD") {
        const keyPath = await arg("Enter the key path to upload:")
        const finalKeyPath = prefix ? `${prefix}${keyPath}` : keyPath

        // Check if the file already exists
        try {
          const headObjectCommand = new HeadObjectCommand({ Bucket: bucketName, Key: finalKeyPath })
          await s3.send(headObjectCommand)
          const overwrite = await confirmAction(`File already exists at ${finalKeyPath}. Do you want to overwrite it?`)
          if (!overwrite) {
            continue
          }
        } catch (err) {
          // File does not exist, proceed with upload
        }

        const filePath = await path({ hint: `Select the file to upload to ${finalKeyPath}` })
        const fileContent = await readFile(filePath)

        const putObjectCommand = new PutObjectCommand({
          Bucket: bucketName,
          Key: finalKeyPath,
          Body: fileContent,
        })
        await s3.send(putObjectCommand)
        await div(md(`### File successfully uploaded to ${finalKeyPath}`))

      } else if (selectedItem.endsWith("/")) {
        history.push(prefix)
        prefix = selectedItem
      } else {
        const headObjectCommand = new HeadObjectCommand({ Bucket: bucketName, Key: selectedItem })
        const headData = await s3.send(headObjectCommand)
        const contentType = headData.ContentType || ""

        const getObjectCommand = new GetObjectCommand({ Bucket: bucketName, Key: selectedItem })
        const url = await getSignedUrl(s3, getObjectCommand, { expiresIn: 3600 })
        const res = isTextFile(selectedItem)
        if (res) {
          const action = await arg(`What would you like to do with ${selectedItem}?`, [
            { name: 'Download', value: 'download' },
            { name: 'Open in editor', value: 'open' },
            { name: 'Delete', value: 'delete' },
          ])
          if (action === 'download') {
            const filePath = await path({ hint: `Select download location for ${selectedItem}` })
            await download(url, filePath)
          } else if (action === 'open') {
            const response = await fetch(url)
            const textData = await response.text()
            const prettyData = await jq.run('.', textData, { input: 'string' })
            if (typeof prettyData === 'string') {
              const editedData = await editor({
                value: prettyData,
                language: res
              });

              const nextAction = await arg(`What would you like to do with the edited version of: ${selectedItem}?`, [
                { name: 'Save Locally', value: 'saveLocal' },
                { name: 'Save to Bucket', value: 'saveBucket' },
              ])

              if (nextAction === 'saveLocal') {
                const saveDestinationPath = await path() // Select a path that doesn't exist
                await writeFile(saveDestinationPath, editedData)
                await div(md(`### File successfully saved locally to ${saveDestinationPath}`))
              } else if (nextAction === 'saveBucket') {
                const confirmSave = await confirmAction(`Are you sure you want to overwrite the file at ${selectedItem}?`)
                if (confirmSave) {
                  const putObjectCommand = new PutObjectCommand({
                    Bucket: bucketName,
                    Key: selectedItem,
                    Body: editedData,
                    ContentType: contentType
                  })
                  await s3.send(putObjectCommand)
                  await div(md(`### File successfully saved to ${selectedItem}`))
                }
              }
            }
          } else if (action === 'delete') {
            const confirmDelete = await confirmAction(`Are you sure you want to delete the file at ${selectedItem}?`)
            if (confirmDelete) {
              const deleteObjectCommand = new DeleteObjectCommand({ Bucket: bucketName, Key: selectedItem })
              await s3.send(deleteObjectCommand)
              await div(md(`### File successfully deleted: ${selectedItem}`))
            }
          }
        } else {
          const filePath = await path({ hint: `Select download location for ${selectedItem}` })
          await download(url, filePath)
        }
        return
      }
    }
  } catch (err) {
    console.error("Error:", err)
    await div(md(`### Error: ${err.message}`))
  }
}

async function selectBucket() {
  const bucketCommand = new ListBucketsCommand({})
  const bucketData = await s3.send(bucketCommand)

  if (!bucketData.Buckets || bucketData.Buckets.length === 0) {
    await div(md(`### No buckets found`))
    return null
  }

  const buckets = bucketData.Buckets.map(bucket => bucket.Name).filter(name => name !== undefined) as string[]
  const bucketOptions = buckets.map(bucket => ({
    name: bucket,
    value: bucket,
    html: `<div style="display: flex; align-items: center;">${icons.bucketIcon}<span style="margin-left: 10px;">${bucket}</span></div>`
  }))
  const selectedBucket = await arg("Select a bucket", bucketOptions)
  return selectedBucket
}

while (true) {
  const selectedBucket = await selectBucket()
  if (selectedBucket) {
    const iterator = s3Explorer(selectedBucket)
    let result = await iterator.next()
    while (!result.done) {
      result = await iterator.next(result.value)
    }
  } else {
    break
  }
}
