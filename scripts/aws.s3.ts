// Name: AWS S3 
// Description: A utility to interact with s3 buckets
// Keyword: AWS
// Author: Aaron Walker, Ph. D. 
import "@johnlindquist/kit"
import { S3Client, ListBucketsCommand, ListObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import yaml from 'js-yaml'
import jq from 'node-jq'


//TODO
//1. add create/delete fns
//2. add some commands to change aws creds and region 
//3. go back to bucket from folder view 


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

async function* s3Explorer(bucketName: string, prefix: string = "") {
  const history: string[] = []

  try {
    while (true) {
      const objectCommand = new ListObjectsCommand({ Bucket: bucketName, Prefix: prefix, Delimiter: '/' })
      const objectData = await s3.send(objectCommand)

      if ((!objectData.Contents || objectData.Contents.length === 0) && (!objectData.CommonPrefixes || objectData.CommonPrefixes.length === 0)) {
        div(md(`### No objects found in bucket: ${bucketName} with prefix: ${prefix}`))
        return
      }

      const items = [
        ...(prefix ? [{ name: "..", value: "..", html: `<div style="display: flex; align-items: center;">${icons.folderIcon}<span style="margin-left: 10px;">..</span></div>` }] : []),
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

      if (selectedItem === "..") {
        if (history.length > 0) {
          prefix = history.pop() || ''
        } else {
          prefix = ""
        }
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
                div(md(`### File successfully saved locally to ${saveDestinationPath}`))
              } else if (nextAction === 'saveBucket') {
                const confirmSave = await arg(`Are you sure you want to overwrite the file at ${selectedItem}?`, [
                  { name: 'Yes', value: 'yes' },
                  { name: 'No', value: 'no' },
                ])
                if (confirmSave === 'yes') {
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
    div(md(`### Error: ${err.message}`))
  }
}

async function selectBucket() {
  const bucketCommand = new ListBucketsCommand({})
  const bucketData = await s3.send(bucketCommand)

  if (!bucketData.Buckets || bucketData.Buckets.length === 0) {
    div(md(`### No buckets found`))
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

const selectedBucket = await selectBucket()
if (selectedBucket) {
  const iterator = s3Explorer(selectedBucket)
  let result = await iterator.next()
  while (!result.done) {
    result = await iterator.next(result.value)
  }
}