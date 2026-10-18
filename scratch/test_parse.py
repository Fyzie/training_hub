import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scripts.download_roboflow import parse_roboflow_snippet

snippet = """
!pip install roboflow

from roboflow import Roboflow
rf = Roboflow(api_key="AbC123XyZ_SecretKey")
project = rf.workspace("industrial-vision").project("power-cables-detection")
version = project.version(4)
dataset = version.download("coco")
"""

result = parse_roboflow_snippet(snippet)
print("Parsed snippet result:", result)
assert result["api_key"] == "AbC123XyZ_SecretKey"
assert result["workspace"] == "industrial-vision"
assert result["project"] == "power-cables-detection"
assert result["version"] == 4
assert result["format"] == "coco"
print("ALL PARSER ASSERTIONS PASSED!")

