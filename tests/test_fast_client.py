from tkt_cli.core.fast_client import extract_hydration_json, iter_video_dicts


def test_extract_hydration_json_and_video_dicts():
    html = '''
    <html><script id="SIGI_STATE" type="application/json">
    {"ItemModule":{"123":{"id":"123","desc":"hello","stats":{"playCount":10},"author":{"uniqueId":"creator"}}}}
    </script></html>
    '''
    payloads = extract_hydration_json(html)
    assert len(payloads) == 1
    videos = list(iter_video_dicts(payloads[0]))
    assert videos[0]["id"] == "123"
    assert videos[0]["author"]["uniqueId"] == "creator"
