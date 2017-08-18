/**
 * Used by collectTextSegments, the number of characters surrounding each end
 * of the found text.
 */
var contextLength = 15

/**
 * setCustomHighlighting
 * Displays (in browser console) the context strings generated from collectTextSegments.
 */
function getResultsContext(rangeData) {
  let string = "WE browser.find demo : content_script.js : getResultsContext\n";
  let segments = collectTextSegments(rangeData);
  for (let segment of segments) {
    string += "    | "+segment+"\n";
  }
  console.log(string);
}

/**
 * collectTextSegments
 *
 * Extrapolates from rangeData, DOM nodes which contain matched text.  Then
 * gathers up text from surrounding nodes to generate a string representing
 * the matches in context.
 */
function collectTextSegments(rangeData) {
  let wins = getFrames(window);
  let rangeDataWins = [];
  let segments = [];
  let context = contextLength;

  // Put range data into window buckets:
  for (let datum of rangeData) {
    let { framePos, startTextNodePos, startOffset, endTextNodePos, endOffset } = datum;
    if (!rangeDataWins[framePos]) {
      rangeDataWins[framePos] = [];
    }
    let rangeDataWin = rangeDataWins[framePos];
    rangeDataWin.push({ startTextNodePos, startOffset, endTextNodePos, endOffset })
  }

  for (let i = 0; i < wins.length; i++) {
    let win = wins[i]
    let data = rangeDataWins[i]
    if (!data) {
      continue;
    }

    let node;
    let nodes = [];
    let doc = win.document;

    if (!doc) {
      continue;
    }

    let walker = doc.createTreeWalker(doc, win.NodeFilter.SHOW_TEXT, null, false);
    while(node = walker.nextNode()) {
      nodes.push(node);
    }

    for (let datum of data) {
      let { startTextNodePos, startOffset,
            endTextNodePos, endOffset } = datum;

      let text = "";
      for (let j = startTextNodePos; j < endTextNodePos + 1; j++) {
        text += nodes[j].textContent;
      }

      let endNode = nodes[endTextNodePos];
      let endText = endNode.textContent;
      let lengthOfEndNode = endText.length;

      let contextStartOffset = startOffset - context;
      let contextEndOffset = (lengthOfEndNode - endOffset) - context;

      let newStartPos = startTextNodePos;
      while (contextStartOffset < 0) {
        newStartPos--;
        if (newStartPos < 0) {
          break;
        }
        let prevText = nodes[newStartPos].textContent;
        contextStartOffset += prevText.length;
        text = prevText+text;
      }

      let newEndPos = endTextNodePos;
      while (contextEndOffset < 0) {
        newEndPos++;
        if (newEndPos == nodes.length) {
          break;
        }
        let nextText = nodes[newEndPos].textContent;
        contextEndOffset += nextText.length;
        text += nextText;
      }

      contextStartOffset = Math.max(0, contextStartOffset);
      text = text.slice(contextStartOffset, (text.length - contextEndOffset));
      text = text.replace(/\s/g, " ");
      segments.push(text);
    }
  }
  return segments;
}

function getFrames(topWin) {
  function getframes(win, frameList) {
    for (var i = 0; win.frames && i < win.frames.length; i++) {
      let frame = win.frames[i];
      if (!frame || !frame.document || !frame.frameElement) {
        continue;
      }
      frameList.push(frame);
      getframes(frame, frameList);
    }
  }
  let frameList = [topWin];
  getframes(topWin, frameList);

  return frameList;
}

var highlighterDivs = [];

/**
 * setCustomHighlighting
 * Uses rectData returned from browser.find.search.
 */
function setCustomHighlighting(rectData, currentResult, overlay) {
  // overlay:
  // Whether to draw borders around result text, or use "highlighter" style,
  // which will overlay the text with a colored background div and re-write the
  // text in the div.
  //
  // **NOTE**: if using overlay, remember that you have injected new text into
  // the document, which will then also be searched on subsequent searches.
  // ie, be sure to remove those before searching again.
  //
  // **NOTE**: Due to bug 1366646 highlighting of text within frames which have
  // borders will be offset by a value equal to the border width.  If frames
  // are nested within frames, this will be additive.

  clearCustomHighlighting();
  let fragment = document.createDocumentFragment();

  for (let i = 0; i < rectData.length; i++) {
    let datum = rectData[i]
    let { rectsAndTexts } = datum;

    let { rectList, textList } = rectsAndTexts;
    for (let j = 0; j < rectList.length; j++) {
      let rect = rectList[j];
      let text = textList[j];
      let { left, top, right, bottom } = rect;
      let width = right - left;
      let height = bottom - top;

      let div = document.createElement("div");
      div.style.width = width+"px";
      div.style.height = height+"px";
      div.style.position = "absolute";

      let divBG;
      let offset = 0;
      if (i == currentResult) {
        divBG = "#a7f432";
        border = "solid 1px blue";
        offset = 1;
      } else {
        divBG = "#fff700"
        border = "solid 1px red"
        offset = 1;
      }
      if (overlay) {
        div.textContent = text;
        div.style.fontSize = height+"px";
        div.style.backgroundColor = divBG;
      } else {
        // We'll be offsetting the div to compensate for border width.
        offset = 1;
        div.style.border = border;
      }
      div.style.left = (left - offset)+"px";
      div.style.top = (top - offset)+"px";

      fragment.appendChild(div);
      highlighterDivs.push(div);
    }
  }
  window.document.body.appendChild(fragment);
}

/**
 * findbarTweakStyleHighlighting
 *
 * A very crude attempt to emulate FindBarTweak style animated "target" highlighting.
 * Uses rectData returned from browser.find.search.
 */
function findbarTweakStyleHighlighting(rectData, currentResult) {
  //
  clearCustomHighlighting();

  let { rectsAndTexts } = rectData[currentResult];
  let rect = rectsAndTexts.rectList[0];
  let { left, top, right, bottom } = rect;
  let width = right - left;
  let height = bottom - top;

  let div = document.createElement("div");
  div.style.width = "30px";
  div.style.height = "30px";
  div.style.position = "absolute";

  div.style.borderRadius = "50px";
  div.style.border = "solid 3px #ef0fff";
  div.style.left = left+"px";
  div.style.top = top+"px";

  window.document.body.appendChild(div);
  div.style.transition = "transform .2s ease-in";

  // Don't know why, but we need to throw this out of the event loop or the
  // transform won't take effect and it will scale immediately.  I think this
  // can be done purely css with @keyframes though, but I'm just wanting to
  // keep the demo simple.
  setTimeout(() => {
    div.style.transform = "scale(10)";
    // Make it disappear when it is to size.
    setTimeout(() => {
      div.remove();
    }, 200);
  }, 10);

  highlighterDivs.push(div);
}

function clearCustomHighlighting() {
  for (let div of highlighterDivs) {
    div.remove();
  }
  highlighterDivs = [];
}

function handleMessage(request, sender, sendResponse) {
  let nature = request.message_nature;
  let tabid = request.tabid;
  if (nature == "get_results_context") {
    getResultsContext(request.rangeData);
    sendResponse({  });
  }
  if (nature == "set_custom_highlighting") {
    if (request.style == 4) {
      findbarTweakStyleHighlighting(request.rectData, request.currentResult);
    } else {
      setCustomHighlighting(request.rectData, request.currentResult, request.style == 3);
    }
dump("set_custom_highlighting : END\n");
    sendResponse({ index: 4 });
  }
}

browser.runtime.onMessage.addListener(handleMessage);
