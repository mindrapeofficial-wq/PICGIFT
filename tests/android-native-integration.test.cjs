const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const android=read('android/app/src/main/java/com/picgift/myapp/MainActivity.kt');
const downloads=read('android/app/src/main/java/com/picgift/myapp/PicgiftPhotoDownloads.kt');
const manifest=read('android/app/src/main/AndroidManifest.xml');
const picker=read('android/app/src/main/res/xml/camera_paths.xml');
const page=read('app.js');

test('photo selection prefers Android Photo Picker and falls back to readable system documents',()=>{
 assert.match(android,/Intent\(MediaStore\.ACTION_IMAGE_CAPTURE\)/);
 assert.match(android,/Intent\(MediaStore\.ACTION_PICK_IMAGES\)/);
 assert.match(android,/catch \(_: android\.content\.ActivityNotFoundException\)/);
 assert.match(android,/Intent\(Intent\.ACTION_OPEN_DOCUMENT\)/);
 assert.match(android,/Intent\.CATEGORY_OPENABLE/);
 assert.match(android,/putExtra\(Intent\.EXTRA_MIME_TYPES, arrayOf\("image\/jpeg", "image\/png", "image\/webp"\)\)/);
 assert.match(android,/if \(fileChooserParams\?\.isCaptureEnabled == true\) launchCamera\(\)\s*else launchPhotoPicker\(multiple\)/);
 assert.doesNotMatch(android,/Intent\.ACTION_PICK\b|ACTION_GET_CONTENT|EXTRA_INITIAL_INTENTS|Intent\.createChooser/);
 assert.match(android,/FileProvider\.getUriForFile/);
 assert.match(android,/filePicker\.launch\(photos\)/);
 assert.match(android,/filePicker\.launch\(documents\)/);
 assert.match(android,/FLAG_GRANT_WRITE_URI_PERMISSION/);
 assert.match(android,/safePickedImage\(it\)/);
 assert.match(manifest,/android:exported="false"/);
 assert.match(picker,/<cache-path name="picgift-camera" path="camera\/"\s*\/>/);
 assert.doesNotMatch(manifest,/android\.permission\.CAMERA|READ_MEDIA_IMAGES|MANAGE_EXTERNAL_STORAGE/);
});

test('OEM gallery results are recovered once and unsupported picks provide feedback',()=>{
 assert.match(android,/fileChooserParams\?\.mode == FileChooserParams\.MODE_OPEN_MULTIPLE/);
 assert.match(android,/pendingPickerLimit = if \(multiple\) 2 else 1/);
 assert.match(android,/putExtra\(MediaStore\.EXTRA_PICK_IMAGES_MAX, pendingPickerLimit\)/);
 assert.match(android,/putExtra\(Intent\.EXTRA_ALLOW_MULTIPLE, multiple\)/);
 assert.match(android,/val candidates = linkedSetOf<Uri>\(\)/);
 assert.match(android,/result\.data\?\.data\?\.let/);
 assert.match(android,/result\.data\?\.clipData\?\.let/);
 assert.match(android,/candidates\.filter \{ safePickedImage\(it\) \}/);
 assert.match(android,/!cameraCaptured && pendingCameraUri == null/);
 assert.match(android,/pendingFileUpload != null && !documentPickerActive/);
 assert.match(android,/documentPickerActive = true/);
 assert.match(android,/return@registerForActivityResult/);
 assert.match(android,/R\.string\.photo_picker_retry/);
 assert.match(android,/R\.string\.photo_picker_invalid/);
 assert.match(android,/uri\.scheme != "content"/);
 assert.match(android,/contentResolver\.openFileDescriptor\(uri, "r"\)\?\.use \{ true \} == true/);
 assert.match(android,/if \(pendingFileUpload != null \|\| pickerInFlight \|\| pickerValidating\) \{ filePathCallback\.onReceiveValue\(null\); return true \}/);
 assert.match(android,/override fun onDestroy\(\) \{[\s\S]*?finishFileSelection\(\)/);
 assert.match(android,/if \(value\?\.contains\(pendingCameraUri\) != true\) pendingCameraFile\?\.delete\(\)/);
 assert.doesNotMatch(manifest,/READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE/);
});

test('signed portrait downloads save to the Android Pictures collection with bounded transfer',()=>{
 assert.match(android,/PicgiftPhotoDownloads\.save/);
 assert.match(downloads,/MediaStore\.Images\.Media\.EXTERNAL_CONTENT_URI/);
 assert.match(downloads,/Environment\.DIRECTORY_PICTURES \+ "\/PICGIFT"/);
 assert.match(downloads,/IS_PENDING/);
 assert.match(downloads,/MAX_BYTES/);
 assert.match(downloads,/if \(bytesRead > MAX_BYTES\)/);
 assert.match(downloads,/http\.instanceFollowRedirects = false/);
 assert.match(downloads,/isTrustedPortrait\(uri: Uri\)/);
 assert.match(downloads,/getQueryParameter\("token"\)/);
 assert.match(downloads,/HttpsURLConnection/);
 assert.doesNotMatch(downloads,/Log\.|println|Authorization.*Bearer/);
});

test('signed portrait navigation uses the same private saver as DownloadListener and confirms only a completed save',()=>{
 const navigation=android.slice(android.indexOf('override fun shouldOverrideUrlLoading'),android.indexOf('if (savedInstanceState == null)'));
 const save=android.slice(android.indexOf('private fun savePortrait('),android.indexOf('private fun accountHash'));
 assert.match(android,/web\.setDownloadListener[\s\S]*?savePortrait\(Uri\.parse\(link\)\)/);
 assert.match(navigation,/PicgiftPhotoDownloads\.isTrustedPortrait\(target\)\) \{ savePortrait\(target\); return true \}/);
 assert.ok(navigation.indexOf('savePortrait(target)')<navigation.indexOf('if (!trusted)'));
 assert.match(save,/currentAccount \?: return/);
 assert.match(save,/target\.path\?\.startsWith\("\/storage\/v1\/object\/sign\/picgift-generated\/\$user\/"\)/);
 assert.match(save,/if \(successful\) dispatchAccountEvent\("picgift:portrait-saved", user\)/);
 assert.doesNotMatch(save,/put\("url"|put\("token"/);
});

test('native payment callbacks carry their account and cannot reach a different web session',()=>{
 const dispatch=android.slice(android.indexOf('private fun dispatchAccountEvent('),android.indexOf('private fun playError'));
 assert.match(dispatch,/detail\.put\("user_id", user\)/);
 assert.match(dispatch,/web\.post\s*\{\s*if \(user != currentAccount \|\| !pageReady \|\| !trustedPicgiftPage\(\)\)/);
 assert.match(android,/val purchaseAccount = billingFlowAccount \?: currentAccount/);
 assert.match(android,/deliverPurchases\(purchases, purchaseAccount\)/);
 assert.match(android,/if \(user != currentAccount \|\| !pageReady\) return@queryPurchasesAsync/);
 assert.match(android,/if \(user != currentAccount \|\| !pageReady\) return@queryProductDetailsAsync/);
 assert.match(android,/dispatchPurchase\(id, purchase\.purchaseToken, user\)/);
 assert.match(android,/if \(billing\.isReady \|\| billingConnecting\) return/);
 assert.match(android,/if \(!billing\.isReady\) \{ connectBilling\(\); return \}/);
});

test('push notifications open allowed Android routes and deliver them into the web app',()=>{
 assert.match(android,/receiveNotificationRoute\(intent\)/);
 assert.match(android,/private fun dispatchNativeRoute\(\)/);
 assert.match(android,/pendingNotificationRoute/);
 assert.match(android,/inspiracion"\) "escenarios"/);
 assert.match(android,/nativeRoutes/);
 assert.match(page,/window\.addEventListener\('picgift:native-route'/);
 assert.match(page,/window\.picgiftPendingNativeRoute/);
 assert.match(read('android/app/src/main/java/com/picgift/myapp/PicgiftMessagingService.kt'),/putExtra\("picgift_route", route\)/);
});

test('Android integration increments version while preserving existing package and secure auth',()=>{
 const gradle=read('android/app/build.gradle.kts');
 assert.match(gradle,/applicationId = "com.picgift.myapp"/);
 assert.ok(Number(gradle.match(/versionCode\s*=\s*(\d+)/)?.[1])>=19,'native photo fixes require an unused Play version code after beta 18');
 assert.match(gradle,/versionName = "\d+\.\d+\.\d+-beta"/);
 assert.match(android,/trustedPicgiftPage\(\)/);
 assert.match(android,/GoogleCredentialSignIn/);
 assert.match(android,/connectBilling\(\)/);
});
