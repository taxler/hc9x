define(['Promise', '../LegacyExplorer'], function(Promise, LegacyExplorer) {

	'use strict';

	function text(bytes, offset, length) {
		return String.fromCharCode.apply(null, bytes.subarray(offset, offset + length));
	}

	function spacePadded(bytes, offset, length) {
		return text(bytes, offset, length).replace(/(\0.*| *)$/, '');
	}

	function byteLenPrefix(bytes, offset) {
		return text(bytes, offset + 1, bytes[offset]);
	}

	function textDateTime(bytes, offset) {
		var year = +text(bytes, offset, 4);
		if (year === 0) return null;
		var month = +text(bytes, offset + 4, 2);
		var day = +text(bytes, offset + 6, 2);
		var hour = +text(bytes, offset + 8, 2);
		var minute = +text(bytes, offset + 10, 2);
		var second = +text(bytes, offset + 12, 2);
		var microsecond = +text(bytes, offset + 14, 2);
		var timeZoneOffset = bytes[offset + 16] - 48;
		var d = new Date(Date.UTC(year, month, day, hour, minute, second, microsecond * 10));
		d.setTime(d.getTime() + timeZoneOffset * (15 * 60 * 1000));
		return d;
	}

	function byteDateTime(bytes, offset) {
		var year = 1900 + bytes[offset + 0];
		var month = bytes[offset + 1];
		var day = bytes[offset + 2];
		var hour = bytes[offset + 3];
		var minute = bytes[offset + 4];
		var second = bytes[offset + 5];
		var timeZoneOffset = (bytes[offset + 6] - 48) * 15 * 1000;
		var d = new Date(Date.UTC(year, month, day, hour, minute, second));
		d.setTime(d.getTime() + timeZoneOffset);
		return d;
	}

	var littleEndianSystem = (function() {
		var test = new Uint16Array([12345]);
		return new DataView(test.buffer, test.byteOffset, test.byteLength).getUint16(0, true) === 12345;
	})();

	if (littleEndianSystem) {
		DataView.prototype.getInt16_LE_BE = function(offset) {
			return this.getInt16(offset, true);
		};
		DataView.prototype.getInt32_LE_BE = function(offset) {
			return this.getInt32(offset, true);
		};
	}
	else {
		DataView.prototype.getInt16_LE_BE = function(offset) {
			return this.getInt16(offset + 2, false);
		};
		DataView.prototype.getInt32_LE_BE = function(offset) {
			return this.getInt32(offset + 4, false);
		};
	}

	function decodeFolderRecord(bytes) {
		var directoryRecordLen = bytes[0];
		if (directoryRecordLen === 0) return null;
		var flags = bytes[25];
		var identifier = byteLenPrefix(bytes, 32);
		var idSplit = identifier.match(/^(.*);(\d+)$/);
		var versionNumber;
		if (idSplit) {
			identifier = idSplit[1];
			versionNumber = +idSplit[2];
		}
		var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		return {
			thisLen: directoryRecordLen,
			extendedAttributeRecordLen: bytes[1],
			sectorOffset: dv.getInt32_LE_BE(2),
			byteLength: dv.getInt32_LE_BE(10),
			recordingDate: byteDateTime(bytes, 18),
			hidden: !!(flags & 1),
			isFolder: !!(flags & 2),
			isAssociatedFile: !!(flags & 4),
			extendedAttributeRecordContainsFormatInfo: !!(flags & 8),
			extendedAttributeRecordSetsOwnerGroupPermissions: !!(flags & 16),
			final: !(flags & 128),
			interleavedFileUnitSize: bytes[26],
			interleavedFileGapSize: bytes[27],
			volumeSequenceNumber: dv.getInt16_LE_BE(28),
			identifier: identifier,
			versionNumber: versionNumber,
		};
	}

	function decodePrimaryDescriptor(bytes) {
		var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		return {
			systemIdentifier: spacePadded(bytes, 8, 32),
			volumeIdentifier: spacePadded(bytes, 40, 32),
			sectorCount: dv.getInt32_LE_BE(80),
			totalDiscCount: dv.getInt16_LE_BE(120),
			volumeSequenceNumber: dv.getInt16_LE_BE(124),
			logicalBlockSize: dv.getInt16_LE_BE(128),
			pathTableSize: dv.getInt32_LE_BE(132),
			pathTableLocationLE: dv.getInt32(140, true),
			pathTableOptionalLocationLE: dv.getInt32(144, true),
			pathTableLocationBE: dv.getInt32(148, false),
			pathTableOptionalLocationBE: dv.getInt32(152, false),
			rootFolderRecord: decodeFolderRecord(bytes.subarray(156, 190)),
			volumeSetIdentifier: spacePadded(bytes, 190, 128),
			publisherIdentifier: spacePadded(bytes, 318, 128), 
			dataPreparerIdentifier: spacePadded(bytes, 446, 128), 
			applicationIdentifier: spacePadded(bytes, 574, 128),
			copyrightFileIdentifier: spacePadded(bytes, 702, 38),
			abstractFileIdentifier: spacePadded(bytes, 740, 36),
			bibliographicFileIdentifier: spacePadded(bytes, 776, 37),
			volumeCreationDateAndTime: textDateTime(bytes, 813),
			volumeModificationDateAndTime: textDateTime(bytes, 830),
			volumeExpirationDateAndTime: textDateTime(bytes, 847),
			volumeEffectiveDateAndTime: textDateTime(bytes, 864),
		};
	}

	function ISO9660Expedition(explorer, byteSource) {
		this.explorer = explorer;
		this.byteSource = byteSource;
	}
	ISO9660Expedition.hintForName = function(name) {
		if (/\.iso$/i.test(name)) return 1;
		if (/\.(img|udf|bin)$/i.test(name)) return 0.8;
		return -1;
	};
	ISO9660Expedition.hintForMimeType = function(type) {
		if (type === 'application/x-iso9660-image') return 1;
		if (type === 'application/octet-stream') return 0.5;
		return -1;
	};
	ISO9660Expedition.prototype = {
		sectorByteLength: 2048,
		logicalBlockSize: 2048,
		get timestamp() {
			return this.primaryDescriptor.volumeModificationDateAndTime;
		},
		get byteLength() {
			return this.primaryDescriptor.sectorCount * this.primaryDescriptor.logicalBlockSize;
		},
		open: function(explorer, byteSource) {
			var self = this;
			return new Promise(function(resolve, reject) {
				var sector = 0x10;
				function getNextDescriptorBytes() {
					return self.byteSource.getBytes(sector * self.sectorByteLength, self.logicalBlockSize);
				}
				function onDescriptor(bytes) {
					if (String.fromCharCode.apply(null, bytes.subarray(1, 7)) !== 'CD001\x01') {
						reject('Not a recognized ISO9660 volume');
						return;
					}
					var sectorType = bytes[0];
					switch(sectorType) {
						case 255: resolve(self); return;
						case 0:
							console.log('boot record');
							break;
						case 1:
							self.primaryDescriptor = decodePrimaryDescriptor(bytes);
							break;
						case 2:
							console.log('supplementary volume descriptor');
							break;
						case 3:
							console.log('volume partition descriptor');
							break;
						default:
							console.log('unknown descriptor: ' + sectorType);
							break;
					}
					sector++;
					return getNextDescriptorBytes().then(onDescriptor);
				}
				return getNextDescriptorBytes().then(onDescriptor);
			});
		},
		get displayName() {
			return this.primaryDescriptor.volumeIdentifier;
		},
		appendTo: function(list) {
			return LegacyExplorer.Item.prototype.appendTo.call(this, list);
		},
		expandTo: function(list) {
			return new Folder(this.explorer, this, this.primaryDescriptor.rootFolderRecord, null).expandTo(list);
		},
	};

	function Folder(explorer, expedition, record, parentFolder) {
		this.explorer = explorer;
		this.expedition = expedition;
		this.record = record;
		this.parentFolder = parentFolder;
	}
	Folder.prototype = {
		get sectorByteLength() {
			return this.expedition.sectorByteLength;
		},
		get sectorOffset() {
			return this.record.sectorOffset;
		},
		get byteOffset() {
			return this.sectorByteLength * this.sectorOffset;
		},
		get byteSource() {
			return this.expedition.byteSource;
		},
		get recordByteLength() {
			return this.record.byteLength;
		},
		get displayName() {
			return this.record.identifier;
		},
		get timestamp() {
			return this.record.recordingDate;
		},
		appendTo: function(list) {
			return LegacyExplorer.Item.prototype.appendTo.call(this, list);
		},
		expandTo: function(list) {
			var sectorByteLength = this.sectorByteLength;
			var self = this;
			var parentOffset = this.parentFolder ? this.parentFolder.sectorOffset : -1;
			return this.byteSource.getBytes(this.byteOffset, this.recordByteLength)
				.then(function(bytes) {
					var promises = [];
					var associated = {};
					for (var i = 0; i < bytes.length; ) {
						var len = bytes[i];
						if (len === 0) {
							i = (Math.floor(i / sectorByteLength) + 1) * sectorByteLength;
							continue;
						}
						var record = decodeFolderRecord(bytes.subarray(i, i + len));
						if (record.isFolder) {
							if (record.sectorOffset !== self.sectorOffset && record.sectorOffset !== parentOffset) {
								promises.push(new Folder(self.explorer, self.expedition, record, self).appendTo(list));
							}
						}
						else {
							var file = new File(self.explorer, self.expedition, record, self);
							if (file.isAssociatedFile) {
								associated[file.displayName] = file;
							}
							else {
								if (file.displayName in associated) {
									file.associatedFile = associated[file.displayName];
									delete associated[file.displayName];
								}
								promises.push(file.appendTo(list));
							}
						}
						i += len;
					}
					return Promise.all(promises).then(function(){ return list; });
				});
		},
	};

	function File(explorer, expedition, record, parentFolder) {
		this.explorer = explorer;
		this.expedition = expedition;
		this.record = record;
		this.parentFolder = parentFolder;
	}
	File.prototype = {
		get displayName() {
			return this.record.identifier;
		},
		get isAssociatedFile() {
			return this.record.isAssociatedFile;
		},
		get byteLength() {
			return this.record.byteLength;
		},
		get sectorOffset() {
			return this.record.sectorOffset;
		},
		get byteSource() {
			return this.expedition.byteSource;
		},
		get byteOffset() {
			return this.sectorOffset * this.expedition.sectorByteLength;
		},
		get timestamp() {
			return this.record.recordingDate;
		},
		appendTo: function(list) {
			return LegacyExplorer.Item.prototype.appendTo.call(this, list);
		},
	};

	LegacyExplorer.registerExpedition(ISO9660Expedition);

	return ISO9660Expedition;

});
