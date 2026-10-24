package com.picgift.myapp

import androidx.core.content.FileProvider

/** Separate component so crop output and camera capture keep independent authorities. */
class PicgiftPreparedPhotoProvider : FileProvider()
