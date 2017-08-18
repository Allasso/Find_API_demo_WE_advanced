/**********************
 * DEMONSTRATION OF browser.find API
 *
 * ADVANCED DEMONSTRATION
 *
 * Demonstrates browser.find.find, browser.find.highlightResults, and
 * browser.find.removeHighlighting.
 *
 * browser.find.find
 *
 * This will search for a phrase and store the results internally, which can then
 *   be used later by browser.find.highlightResults.  Note that these results
 *   persist until the next browser.find.search operation, and thus can be used
 *   over again repeatedly by browser.find.highlightResults without running another
 *   search, eg, to highlight different matches for the same search.
 *
 *   It will also (optionally) return the following:
 *
 *   `rangeData` from which can be extrapolated the DOM nodes wherein matches
 *   were found.  Useful to extensions for finding surrounding text of the matches
 *   which can give a summary display of results in context in a separate UI.
 *   Demonstration of the use for this is found in content_script.js > collectTextSegments
 *
 *   `rectData` which provides cartesian coordinates of all the text matched in
 *   the search, relative to the top-level document[1].  Useful to extensions for
 *   providing custom highlighting of results.
 *   Demonstration of the use for this is found in content_script.js > setCustomHighlighting
 *   and content_script.js > setCustomHighlighting.
 *
 * browser.find.highlightResults
 *
 * This will use internal Find highlighting mechanism (nsISelectionController)
 *   to highlight results found in previous browser.find.find.  Note that this
 *   can be run independently of browser.find.find, as long as a search has
 *   been made and there are results in the cache.  Note that because this uses
 *   the native highlighting mechanism, its use may override Find operations
 *   using the Findbar, and vice versa.
 *
 * browser.find.removeHighlighting
 *
 * This will use internal Find highlighting mechanism (nsISelectionController)
 *   to remove all highlighting made by a previous highlight operation.
 *
 * This demo works as follows:
 *
 *   Upon clicking the browserAction button, a browser.find.find will be made,
 *   and upon resolving, a highlighing operation will be performed, of which is
 *   determined by HIGHLIGHTING_STYLE (See prefixed documentation for that).
 *   After 3 seconds, any highlighting made by browser.find.highlight will be
 *   cleared.
 *
 *   If `includeRangeData` is true, results will be displayed with surrounding
 *   context in the browser console.
 *
 *   References to parameters for browser.find.find and browser.find.highlightResults
 *   are set in global variables at the top of this script for convenience.
 *
 * [1] See caveats regarding custom highlighting in documentation for
 *   setCustomHighlighting.
 *
 *
 * NOTES ON HIGHLIGHTING DEMO:
 *
 * global HIGHLIGHTING_STYLE sets the highlighting style, using an integer
 * value of 1, 2, 3 or 4.
 *
 * Note regarding terms:
 *
 * "Custom highlighting" refers to highlighting done by the user, which could be
 *   applied using a content script (as in the case of this demo, content_script.js).
 *
 * browser.find.highlighting (the WebExtension API) uses the native internal Find
 *   highlighting mechanism (nsISelectionController).
 *
 * Nevertheless, either or both can be use congruently.
 *
 * This attempts to demonstrate the different possibilities of highlighting.
 *   These are just some examples; the user can implement highlighting options
 *   in any combination which will achieve the desired effect.
 *
 *   HIGHLIGHTING STYLES:
 *
 *   1  Uses only browser.find.highlightResults.  Item at `rangeIndex`
 *      will be highlighted, or if `rangeIndex` is null, all items will be highlighted.
 *      This is the simplest and easiest to implement.
 *
 *   2  Uses only custom highlighting to draw rectangles around found text, red for
 *      all matches, blue for match found at `rangeIndex`.
 *      Code for this is found in content_script.js => setCustomHighlighting.
 *
 *   3  Uses only custom highlighting for "highlighter" style highlighting where
 *      matches are overlayed with colored boxes containing the text, boxes are
 *      colored yellow for all matches, green for match found at `rangeIndex`.
 *      Code for this is found in content_script.js => setCustomHighlighting.
 *
 *   4  "FindBarTweak" style - uses both custom highlighting and browser.find.highlightResults.
 *      Uses browser.find.highlightResults to highlight all results, then uses
 *      custom highlighting to provide FBT "target" style animation over match
 *      found at `rangeIndex`.
 *      Code for the custom highlighting part of this is found in
 *      content_script.js => findbarTweakStyleHighlighting.
 *      Note this uses a very crude implementation of FBT's animated animated
 *      highlighting, as it is just for demonstration purposes.
 *
 * **NOTE** FOR ANY CUSTOM HIGHLIGHTING IN THIS DEMO (2, 3 and 4), `includeRectData`
 *          MUST BE TRUE, AND `rangeIndex` MUST HAVE A VALUE WITHIN RANGE.
 *
 * **NOTE** When using browser.find.highlightResults (1 and 4) a script in this
 *   file will clear all highlighting after 3 seconds.  The delayed clearing is
 *   only for purposes of demonstration of browser.find.removeHighlighting.
 *   IRL, it would probably not be used this way.
 *
 * **NOTE** See caveats regarding custom highlighting in documentation for
 *   setCustomHighlighting.
 **********************/

/**********************
 * DEMO PARAMETERS - globally set params for browser.find methods here for convenience.
 */

/**
 * browser.find.find parameters:
 */
let queryphrase = "the";
let caseSensitive = false;
let entireWord = false;
let includeRangeData = true;  /* If true, return range data from which can be
                                 extrapolated the DOM nodes wherein matches were found.
                                 Useful for extracting text surrounding matches. */
let includeRectData = true;  /* If true, return rectangle data from which can be
                                extracted the cartesian coordinates of matches.
                                Useful for custom highlighting of matches. */

/**
 * browser.find.highlightResults parameters:
 */
let rangeIndex = 0;  /* Index of the match to highlight,
                        and the match to scroll to if `!noScroll` */
let noScroll = false;  /* Default will scroll the match at `rangeIndex` into view.
                          If this is true, no scrolling occurs. */

/**
 * Highlighting style, integer value of 1, 2, 3 or 4:
 *
 *   1 - uses only native Find highlighting via browser.find.highlightResults
 *   2 - uses only custom highlighting - draws rectangles around results.
 *   3 - uses only custom highlighting - covers results with colored boxes and text.
 *   4 - combines native and custom highlighting to give "FindbarTweak" animation effect.
 *
 *   (See documentation above for more detailed description of highlighting styles).
 */
let HIGHLIGHTING_STYLE = 4;

/**
 * END DEMO PARAMETERS
 **********************/

/**
 * Utility:
 */
let timerID;
let globalT0;

let findAndHighlight = async function() {
  /**
   * Call browser.find.find:
   * Documentation from browser.find.find API:
   *
   ** browser.find.find
   ** Searches document and its frames for a given queryphrase and stores all found
   ** Range objects in an array accessible by other browser.find methods.
   **
   ** @param {string} queryphrase - The string to search for.
   ** @param {object} params optional - may contain any of the following properties,
   **   all of which are optional:
   **   {integer} tabId - Tab to query.  Defaults to the active tab.
   **   {boolean} caseSensitive - Highlight only ranges with case sensitive match.
   **   {boolean} entireWord - Highlight only ranges that match entire word.
   **   {boolean} includeRangeData - Whether to return range data.
   **   {boolean} includeRectData - Whether to return rectangle data.
   **
   ** @returns a promise that will be resolved when search is completed, that includes:
   **   {integer} count - number of results found.
   **   {array} rangeData (if opted) - serialized representation of ranges found.
   **   {array} rectData (if opted) - rect data of ranges found.
   *
   * Simply running browser.find.find(queryphrase) will perform a basic search
   *  and cache results in the API.
   */
globalT0 = Date.now();
  // DEMO:  Search for `queryphrase`.
  let tabs = await browser.tabs.query({ currentWindow: true, active: true });
  let tabId = tabs[0].id;
  let data = await browser.find.find(queryphrase, { tabId: null,
                                                      caseSensitive: caseSensitive,
                                                      entireWord: entireWord,
                                                      includeRangeData: includeRangeData,
                                                      includeRectData: includeRectData });

  dump("WE : background.js : browser.find.find : et : "+(Date.now() - globalT0)+"    results count : "+data.count+"\n");
  // DEMO:  If opted, get surrounding context of results.
  if (includeRangeData) {
    browser.tabs.sendMessage(tabId,
    {
      message_nature: "get_results_context",
      tabid: tabId,
      rangeData: data.rangeData
    });
  }
  // DEMO:  If opted, set custom highlighting based on `HIGHLIGHTING_STYLE`.
  if (includeRectData && HIGHLIGHTING_STYLE != 1) {
    let response = await browser.tabs.sendMessage(tabId,
                                                  { message_nature: "set_custom_highlighting",
                                                    tabid: tabId,
                                                    rectData: data.rectData,
                                                    currentResult: rangeIndex,
                                                    style: HIGHLIGHTING_STYLE });

    dump("WE : background.js : set_custom_highlighting : et : "+(Date.now() - globalT0)+"\n");
  }

  // Demo `HIGHLIGHTING_STYLE`s 2 & 3 do not implement native Find highlighting.
  if (HIGHLIGHTING_STYLE == 2 || HIGHLIGHTING_STYLE == 3) {
    return;
  }

  /*
   * Call browser.find.highlightResults:
   * Documentation from browser.find.highlightResults API:
   *
   ** browser.find.highlightResults
   ** Highlights range(s) found in previous browser.find.find.
   **
   ** @param {object} params optional - may contain any of the following properties:
   **   all of which are optional:
   **   {integer} rangeIndex - Found range to be highlighted. Default highlights all ranges.
   **   {integer} tabId - Tab to highlight.  Defaults to the active tab.
   **   {boolean} noScroll - Don't scroll to highlighted item.
   **
   ** Throws exception if index supplied was out of range, or
   **  there were no search results to highlight.
   *
   * Simply running browser.find.highlightResults() with no args will highlight
   *  all results from the last search.
   *
   * **NOTE** Highlighting here uses native internal highlighting mechanisms
   *  (nsISelectionController).  Any highlighting done with this method will be
   *  independent of highlighting done using custom highlighting methods in the
   *  content script (which uses rectData returned from browser.find.find),
   *  and either may be used with the other. (or even conflict if not well thought out.)
   *  eg, one may use browser.find.highlightResults to highlight ALL results,
   *  then use highlighting methods in the content script to provide custom effects
   *  on the desired result such as "FindBarTweak" style animated "target" effect.
   */
  // DEMO:  Highlight results found.  HIGHLIGHTING_STYLE == 4 means we're using
  // FindBarTweak style custom highlighting, so we want to highlight all matches here.
  browser.find.highlightResults({ rangeIndex: HIGHLIGHTING_STYLE == 4 ? null : rangeIndex,
                                  tabId: null,
                                  noScroll: noScroll });
  dump("WE : background.js : browser.find.highlightResults : et : "+(Date.now() - globalT0)+"\n");

  // DEMO: Remove all highlighting after 3 seconds.
  clearTimeout(timerID);
  timerID = setTimeout(() => {
    /**
     * Call browser.find.removeHighlighting - removes all highlighting.
     */
    browser.find.removeHighlighting();
  }, 3000);
}

browser.browserAction.onClicked.addListener(() => {
  findAndHighlight();
});
