import test from "node:test";
import assert from "node:assert/strict";
import {reconstructPdfPage} from "../src/lib/documents/pdf-text.ts";

test("preserves explicit line breaks from PDF.js",()=>{
 const text=reconstructPdfPage([{str:"The Supplier",hasEOL:true},{str:"shall pay AED 100,000.",hasEOL:false}]);
 assert.equal(text,"The Supplier\nshall pay AED 100,000.");
});

test("adds a separator when text fragments are spatially distant",()=>{
 const text=reconstructPdfPage([
  {str:"The",width:14,transform:[10,0,0,10,0,100]},
  {str:"Supplier",width:30,transform:[10,0,0,10,22,100]}
 ]);
 assert.equal(text,"The Supplier");
});

test("does not invent a space for adjacent fragments of the same word",()=>{
 const text=reconstructPdfPage([
  {str:"liab",width:17,transform:[10,0,0,10,0,100]},
  {str:"ility",width:20,transform:[10,0,0,10,17,100]}
 ]);
 assert.equal(text,"liability");
});

test("empty PDF text array does not pretend to contain extracted text",()=>{
 assert.equal(reconstructPdfPage([]),"");
});
