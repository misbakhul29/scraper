import * as fs from 'fs';
import * as path from 'path';
import { SessionData } from './session-manager';

/**
 * Simple binary format for session data
 * Format: [version:1byte][data_length:4bytes][json_data:variable]
 */
export class SessionBinary {
  private static readonly VERSION = 1;
  private static readonly MAGIC = Buffer.from('CHATGPT_SESSION', 'utf8');

  /**
   * Encode session data to binary format
   */
  static encode(sessionData: SessionData): Buffer {
    // Convert to JSON string
    const jsonData = JSON.stringify(sessionData);
    const jsonBuffer = Buffer.from(jsonData, 'utf8');
    
    // Create buffer: [magic:15bytes][version:1byte][data_length:4bytes][json_data:variable]
    const magicLength = this.MAGIC.length;
    const versionLength = 1;
    const lengthSize = 4;
    const totalLength = magicLength + versionLength + lengthSize + jsonBuffer.length;
    
    const buffer = Buffer.allocUnsafe(totalLength);
    let offset = 0;
    
    // Write magic bytes
    this.MAGIC.copy(buffer, offset);
    offset += magicLength;
    
    // Write version
    buffer.writeUInt8(this.VERSION, offset);
    offset += versionLength;
    
    // Write data length
    buffer.writeUInt32BE(jsonBuffer.length, offset);
    offset += lengthSize;
    
    // Write JSON data
    jsonBuffer.copy(buffer, offset);
    
    return buffer;
  }

  /**
   * Decode binary format to session data
   */
  static decode(buffer: Buffer): SessionData {
    let offset = 0;
    
    // Read and verify magic bytes
    const magicLength = this.MAGIC.length;
    const magic = buffer.slice(offset, offset + magicLength);
    if (!magic.equals(this.MAGIC)) {
      throw new Error('Invalid session binary format: magic bytes mismatch');
    }
    offset += magicLength;
    
    // Read version
    const version = buffer.readUInt8(offset);
    if (version !== this.VERSION) {
      throw new Error(`Unsupported session binary version: ${version}`);
    }
    offset += 1;
    
    // Read data length
    const dataLength = buffer.readUInt32BE(offset);
    offset += 4;
    
    // Read JSON data
    const jsonBuffer = buffer.slice(offset, offset + dataLength);
    const jsonString = jsonBuffer.toString('utf8');
    
    // Parse JSON
    try {
      return JSON.parse(jsonString) as SessionData;
    } catch (e) {
      throw new Error(`Failed to parse session JSON: ${e}`);
    }
  }

  /**
   * Convert JSON session file to BIN
   */
  static convertJsonToBin(jsonPath: string, binPath?: string): string {
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`JSON file not found: ${jsonPath}`);
    }

    // Read JSON file
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as SessionData;
    
    // Encode to binary
    const binaryData = this.encode(jsonData);
    
    // Determine output path
    const outputPath = binPath || jsonPath.replace(/\.json$/, '.bin');
    
    // Write binary file
    fs.writeFileSync(outputPath, binaryData);
    
    return outputPath;
  }

  /**
   * Load session from BIN file
   */
  static loadFromBin(binPath: string): SessionData {
    if (!fs.existsSync(binPath)) {
      throw new Error(`BIN file not found: ${binPath}`);
    }

    const buffer = fs.readFileSync(binPath);
    return this.decode(buffer);
  }
}

