/**
 * Triggered from a message on a Cloud Pub/Sub topic.
 *
 * @param {!Object} event Event payload.
 * @param {!Object} context Metadata for the event.
 */
exports.egress= async (event, context) => {
  
	const password = await getSPPassword();
    //Get file path from Pub/Sub message
    const filePath = await getGCSPath(event);
    //Download file from GCS
    const downloadPath = await getFileFromGCS(filePath);
    //Upload file to Sharepoint 
    const uploadStatus = await sharepointUpload(downloadPath,password);
};


async function getSPPassword(){

	var decryptedPwd;
	try{
		const crc32c = require('fast-crc32c');
		const client = new KeyManagementServiceClient();
		const bucketName=process.env.KMS_BUCKET; //'aiadms_65343_egresstest1';
		const fileName=process.env.KMS_ENC_FILE; //'kmstest/pat_4510--Release-4.enc';
		const storage = new Storage();
		
		//Initialize KMS related variables
		const projectId = process.env.GCP_PROJECT_ID; //'npd-65343-dv3dms-bd-8648fbf4';
		const location = process.env.GCP_PROJECT_REGION; //'us-east1';
		const keyRingId = process.env.KEY_RING; //'npd-65343-dv3dms-bd-8648fbf4-rng';
		const keyId = process.env.KEY_ID; //'npd-65343-dv3dms-bd-8648fbf4-2-ky';
		const keyName = client.cryptoKeyPath(projectId, location, keyRingId, keyId);


		const file = await new Storage()
			.bucket(bucketName)
			.file(fileName)
			.download();

		var ciphertext = file[0];
		
		const ciphertextCrc32c = crc32c.calculate(ciphertext);
		const [decryptResponse] = await client.decrypt({
			name: keyName,
			ciphertext: ciphertext,
			ciphertextCrc32c: {
				value: ciphertextCrc32c,
			},
		});

		decryptedPwd = decryptResponse.plaintext.toString('utf8');
	}catch(e){
	}

	return decryptedPwd;
}

//Get GCS path of file from Pub/Sub event 
async function getGCSPath(event){
    const message = Buffer.from(event.data, 'base64').toString();
    const id = JSON.parse(message).id;
    const filePath = id.substring(0, id.lastIndexOf("/"));
    return filePath;
}

//Download file from GCS bucket
async function getFileFromGCS(filepath){
    const {Storage} = require('@google-cloud/storage');
    const storage = new Storage();
    try{
        const bucket = filepath.substring(0, filepath.indexOf("/"));
        const path = filepath.substring(filepath.indexOf("/")+1, filepath.length);
        const filename = filepath.substring(filepath.lastIndexOf("/")+1, filepath.length);
    
        const destFileName = "/tmp/"+filename;
        const options = {
            destination: destFileName,
        };
        // Downloads the file
        await storage.bucket(bucket).file(path).download(options);
        return destFileName;
    } catch(err){
        return "";
    }        
}

//Upload file to sharepoint location 
async function sharepointUpload(downloadPath, sppassword){
    try{
        var spsave = require("spsave").spsave;
        const fs = require('fs'); 
        const uploadFilename = downloadPath.substring(downloadPath.lastIndexOf("/")+1, downloadPath.length);
        var coreOptions = {
            siteUrl: process.env.SHAREPOINTURL,
            notification: true,
            checkin: true,
            checkinType: 1
        };
        var creds = {
            username: process.env.SHAREPOINTUSERNAME,
            password: sppassword,
            domain: process.env.DOMAIN
        };
        
        var fileOptions = {
            folder: process.env.SHAREPOINTFOLDERNAME,
            fileName: uploadFilename,
            fileContent: fs.readFileSync(downloadPath)
        };
  
        spsave(coreOptions, creds, fileOptions)
        .then(function(){
            return true;
        })
        .catch(function(err){
            return false;
        });
    } catch(err){
        return false;
    }
}
